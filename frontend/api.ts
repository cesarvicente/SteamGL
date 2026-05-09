export interface DLCInfo {
	appid: number;
	name: string;
	imageUrl: string;
	isBase: boolean;
	source: string; // de onde veio o appid (storefront, pics, internal)
}

const STORE_URL = 'https://store.steampowered.com/api/appdetails';
const HEADER_IMAGE = (appid: number) =>
	`https://shared.fastly.steamstatic.com/store_item_assets/steam/apps/${appid}/header.jpg`;

interface AppDetailsResponse {
	[appid: string]: {
		success: boolean;
		data?: {
			name?: string;
			type?: string;
			header_image?: string;
			dlc?: number[];
		};
	};
}

async function fetchJson<T>(url: string, timeoutMs = 12000): Promise<T> {
	const ctrl = new AbortController();
	const t = setTimeout(() => ctrl.abort(), timeoutMs);
	try {
		const res = await fetch(url, { signal: ctrl.signal });
		if (!res.ok) throw new Error(`HTTP ${res.status}`);
		return (await res.json()) as T;
	} finally {
		clearTimeout(t);
	}
}

async function fetchAppDetails(appid: number, filters = 'basic'): Promise<AppDetailsResponse[string]['data'] | null> {
	const url = `${STORE_URL}?appids=${appid}&filters=${filters}&l=portuguese`;
	try {
		const data = await fetchJson<AppDetailsResponse>(url);
		const entry = data[String(appid)];
		if (!entry || !entry.success) return null;
		return entry.data ?? null;
	} catch {
		return null;
	}
}

const SOUNDTRACK_PATTERNS = [
	/soundtrack/i,
	/\bost\b/i,
	/original\s+score/i,
	/trilha\s+sonora/i,
	/\bbgm\b/i,
];

function isSoundtrack(name: string, type?: string): boolean {
	if (type === 'music') return true;
	return SOUNDTRACK_PATTERNS.some((re) => re.test(name));
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Tenta extrair DLCs via APIs internas do Steam Client (PICS).
 * Essas APIs têm acesso ao PICS completo e geralmente retornam TODAS as DLCs,
 * incluindo as ocultas/deslistadas que a Storefront API não mostra.
 */
function getDLCsFromSteamInternal(appid: number): { ids: number[]; names: Map<number, string> } {
	const ids = new Set<number>();
	const names = new Map<number, string>();
	const win = window as any;

	// 1. appStore.GetAppOverviewByAppID(appid).m_setAvailableDLC
	try {
		const overview = win.appStore?.GetAppOverviewByAppID?.(appid);
		if (overview) {
			console.log('[GreenLumar] appStore overview keys:', Object.keys(overview).filter((k) => k.toLowerCase().includes('dlc')));
			// Vários campos possíveis
			for (const key of [
				'm_setAvailableDLC',
				'm_setOwnedDLC',
				'available_dlc',
				'dlc',
				'm_rgAvailableDLC',
				'm_mapAvailableDLC',
			]) {
				const v = overview[key];
				if (v) {
					console.log(`[GreenLumar] appStore.${key}:`, v);
					try {
						if (v instanceof Set) v.forEach((id: any) => ids.add(parseInt(String(id), 10)));
						else if (Array.isArray(v)) v.forEach((id: any) => ids.add(parseInt(String(id), 10)));
						else if (v.data_) v.data_.forEach((e: any) => ids.add(parseInt(String(e.value_ ?? e.key_), 10)));
						else if (typeof v === 'object') Object.keys(v).forEach((k) => ids.add(parseInt(k, 10)));
					} catch (e) {
						console.warn(`[GreenLumar] erro lendo ${key}:`, e);
					}
				}
			}
		}
	} catch (e) {
		console.warn('[GreenLumar] appStore error:', e);
	}

	// 2. appDetailsStore.GetAppDetails(appid) — tem dlc detail
	try {
		const details = win.appDetailsStore?.GetAppDetails?.(appid);
		if (details) {
			console.log('[GreenLumar] appDetailsStore keys:', Object.keys(details));
			for (const key of ['vecDLC', 'rgDLC', 'dlcs', 'dlc']) {
				const v = details[key];
				if (Array.isArray(v) && v.length > 0) {
					console.log(`[GreenLumar] appDetailsStore.${key}:`, v.length);
					v.forEach((entry: any) => {
						const id = parseInt(String(entry.appid ?? entry.id ?? entry), 10);
						if (id) {
							ids.add(id);
							if (entry.strName || entry.name) names.set(id, entry.strName ?? entry.name);
						}
					});
				}
			}
		}
	} catch (e) {
		console.warn('[GreenLumar] appDetailsStore error:', e);
	}

	// 3. SteamClient.Apps.* — várias possibilidades
	try {
		const apps = win.SteamClient?.Apps;
		if (apps) {
			const candidates = ['GetAvailableDLC', 'GetDLCDataByAppID', 'GetDLCsByAppID', 'GetDLCList'];
			for (const fn of candidates) {
				if (typeof apps[fn] === 'function') {
					console.log(`[GreenLumar] SteamClient.Apps.${fn} existe`);
					try {
						const r = apps[fn](appid);
						console.log(`[GreenLumar] ${fn} retornou:`, r);
					} catch (e) {
						console.warn(`[GreenLumar] ${fn} erro:`, e);
					}
				}
			}
		}
	} catch (e) {
		console.warn('[GreenLumar] SteamClient.Apps error:', e);
	}

	// 4. collectionStore — tem coleções incluindo DLCs ownedo usuário
	try {
		const cs = win.collectionStore;
		if (cs) {
			console.log('[GreenLumar] collectionStore keys:', Object.keys(cs).slice(0, 20));
		}
	} catch {}

	return { ids: Array.from(ids), names };
}

/**
 * Tenta scrape do SteamDB que tem PICS data completo (pode falhar com 403 Cloudflare).
 */
async function getDLCsFromSteamDB(appid: number): Promise<{ ids: number[]; names: Map<number, string> }> {
	const ids = new Set<number>();
	const names = new Map<number, string>();
	try {
		const res = await fetch(`https://steamdb.info/app/${appid}/dlc/`, {
			headers: {
				Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
			},
		});
		if (!res.ok) {
			console.warn(`[GreenLumar] SteamDB HTTP ${res.status}`);
			return { ids: [], names };
		}
		const html = await res.text();
		// Padrão: linhas da tabela com <tr data-appid="123"> ... <td>name</td>
		const rowRe = /<tr[^>]*data-appid="(\d+)"[^>]*>([\s\S]*?)<\/tr>/gi;
		let m: RegExpExecArray | null;
		while ((m = rowRe.exec(html))) {
			const id = parseInt(m[1], 10);
			if (id !== appid) {
				ids.add(id);
				const nameMatch = m[2].match(/<td[^>]*>\s*([^<]+?)\s*<\/td>/);
				if (nameMatch) names.set(id, nameMatch[1].trim());
			}
		}
		// Fallback: pega data-appid em qualquer lugar
		if (ids.size === 0) {
			const re = /data-appid="(\d+)"/g;
			let mm: RegExpExecArray | null;
			while ((mm = re.exec(html))) {
				const id = parseInt(mm[1], 10);
				if (id !== appid) ids.add(id);
			}
		}
		console.log(`[GreenLumar] SteamDB retornou ${ids.size} DLCs`);
	} catch (e) {
		console.warn('[GreenLumar] SteamDB erro:', e);
	}
	return { ids: Array.from(ids), names };
}

async function getDLCsFromStorefront(appid: number): Promise<{ ids: number[]; baseName: string }> {
	const baseDetails = await fetchAppDetails(appid, 'basic');
	return {
		ids: baseDetails?.dlc ?? [],
		baseName: baseDetails?.name ?? `App ${appid}`,
	};
}

/**
 * Busca jogo base + todas as DLCs combinando múltiplas fontes.
 */
export async function fetchGameAndDLCs(
	baseAppId: number,
	onProgress?: (current: number, total: number, status: string) => void,
): Promise<DLCInfo[]> {
	onProgress?.(0, 0, 'consultando Storefront...');
	const storefront = await getDLCsFromStorefront(baseAppId);

	onProgress?.(0, 0, 'consultando PICS interno...');
	const internal = getDLCsFromSteamInternal(baseAppId);

	onProgress?.(0, 0, 'consultando SteamDB...');
	const steamdb = await getDLCsFromSteamDB(baseAppId);

	console.log(`[GreenLumar] storefront=${storefront.ids.length} internal=${internal.ids.length} steamdb=${steamdb.ids.length}`);

	// União das três fontes
	const allIds = new Set<number>();
	storefront.ids.forEach((id) => allIds.add(id));
	internal.ids.forEach((id) => allIds.add(id));
	steamdb.ids.forEach((id) => allIds.add(id));

	const sourceMap = new Map<number, string[]>();
	for (const id of allIds) {
		const sources: string[] = [];
		if (storefront.ids.includes(id)) sources.push('storefront');
		if (internal.ids.includes(id)) sources.push('internal');
		if (steamdb.ids.includes(id)) sources.push('steamdb');
		sourceMap.set(id, sources);
	}

	const allIdsArr = Array.from(allIds).sort((a, b) => a - b);

	const result: DLCInfo[] = [
		{
			appid: baseAppId,
			name: storefront.baseName,
			imageUrl: HEADER_IMAGE(baseAppId),
			isBase: true,
			source: 'base',
		},
	];

	const total = allIdsArr.length;
	if (total === 0) {
		onProgress?.(0, 0, 'nenhuma DLC encontrada');
		return result;
	}

	onProgress?.(0, total, '');

	const BATCH = 5;
	const DELAY = 350;
	let done = 0;
	let skipped = 0;

	for (let i = 0; i < allIdsArr.length; i += BATCH) {
		const batch = allIdsArr.slice(i, i + BATCH);
		const fetched = await Promise.all(
			batch.map(async (id) => {
				const internalName = internal.names.get(id);
				const steamdbName = steamdb.names.get(id);
				let name = internalName ?? steamdbName;
				let type: string | undefined;
				if (!name) {
					const d = await fetchAppDetails(id, 'basic');
					name = d?.name ?? `App ${id}`;
					type = d?.type;
				}
				if (isSoundtrack(name, type)) return null;
				return {
					appid: id,
					name,
					imageUrl: HEADER_IMAGE(id),
					isBase: false,
					source: (sourceMap.get(id) ?? []).join('+'),
				} as DLCInfo;
			}),
		);
		for (const f of fetched) {
			if (f) result.push(f);
			else skipped++;
		}
		done += batch.length;
		// Subtrai soundtracks ignoradas pra contagem refletir os itens reais
		onProgress?.(done - skipped, total - skipped, '');
		if (i + BATCH < allIdsArr.length) await sleep(DELAY);
	}

	return result;
}
