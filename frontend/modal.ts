import { fetchGameAndDLCs, DLCInfo } from './api';
import { STEAM_ICON_BASE64 } from './icon';
import { callBackend } from './backend';

const saveAppids = (appids_json: string) => callBackend<string>('Backend.save_appids', { appids_json });
const restartSteam = () => callBackend<string>('Backend.restart_steam_via_dllinjector');

const STYLE_ID = 'greenlumar-modal-style';

const CSS = `
.gl-overlay {
	position: fixed; inset: 0;
	background: rgba(0, 0, 0, 0.75);
	z-index: 999999;
	display: flex; align-items: center; justify-content: center;
	font-family: "Motiva Sans", Arial, sans-serif;
	color: #c7d5e0;
}
.gl-modal {
	background: #1b2838;
	border: 1px solid #316282;
	border-radius: 4px;
	width: 720px; max-width: 95vw;
	height: 85vh;
	display: flex; flex-direction: column;
	box-shadow: 0 8px 32px rgba(0,0,0,0.6);
	overflow: hidden;
}
.gl-header {
	background: linear-gradient(to bottom, #2a475e, #1b2838);
	padding: 14px 20px;
	border-bottom: 1px solid #000;
	display: flex; align-items: center; gap: 10px;
}
.gl-header img { width: 24px; height: 24px; }
.gl-header h2 {
	margin: 0; font-size: 18px; color: #ffffff; font-weight: 400;
	text-transform: uppercase; letter-spacing: 1px;
}
.gl-loading {
	padding: 60px 20px; text-align: center;
}
.gl-spinner {
	width: 56px; height: 56px;
	border: 5px solid #2a475e;
	border-top-color: #66c0f4;
	border-radius: 50%;
	animation: gl-spin 0.9s linear infinite;
	margin: 0 auto 16px;
}
@keyframes gl-spin { to { transform: rotate(360deg); } }
.gl-loading-text { font-size: 15px; color: #c7d5e0; }
.gl-progress { font-size: 13px; color: #8f98a0; margin-top: 6px; }
.gl-toolbar {
	padding: 10px 16px;
	display: flex; gap: 10px; align-items: center;
	border-bottom: 1px solid #000;
	background: #16202d;
}
.gl-btn {
	background: linear-gradient(to bottom, #67c1f5 5%, #417a9b 95%);
	color: #fff; border: none; padding: 6px 14px; cursor: pointer;
	border-radius: 2px; font-size: 13px;
	transition: filter 0.15s;
}
.gl-btn:hover { filter: brightness(1.15); }
.gl-btn-secondary {
	background: linear-gradient(to bottom, #4a6878 5%, #2c3e50 95%);
}
.gl-btn-confirm {
	background: linear-gradient(to bottom, #5ba32b 5%, #2d6914 95%);
	font-weight: bold; padding: 8px 22px;
}
.gl-btn:disabled { opacity: 0.5; cursor: not-allowed; }
.gl-search {
	flex: 1;
	background: #316282; color: #fff; border: 1px solid #000;
	padding: 5px 10px; border-radius: 2px; font-size: 12px;
}
.gl-table-wrap { overflow-y: auto; flex: 1; }
.gl-table { width: 100%; border-collapse: collapse; font-size: 13px; }
.gl-table thead th {
	position: sticky; top: 0; z-index: 1;
	background: #2a3f5a; color: #c7d5e0;
	text-align: left; padding: 10px 12px;
	font-weight: 600; font-size: 11px;
	text-transform: uppercase; letter-spacing: 0.5px;
	border-bottom: 1px solid #000;
}
.gl-table tbody tr {
	background: #1b2838;
	border-bottom: 1px solid #0f1923;
}
.gl-table tbody tr:hover { background: #243447; }
.gl-table tbody tr.gl-base { background: #1f3147; }
.gl-table tbody tr.gl-base:hover { background: #2a4360; }
.gl-table td { padding: 8px 12px; vertical-align: middle; }
.gl-col-check { width: 90px; text-align: center; }
.gl-col-appid { width: 90px; font-family: Consolas, monospace; color: #8f98a0; }
.gl-col-image { width: 130px; }
.gl-col-image img {
	width: 120px; height: 45px; object-fit: cover; display: block;
	background: #0f1923; border-radius: 2px;
}
.gl-checkbox {
	width: 18px; height: 18px;
	cursor: pointer; accent-color: #67c1f5;
}
.gl-base-tag {
	display: inline-block; background: #5ba32b; color: #fff;
	font-size: 10px; padding: 1px 6px; border-radius: 2px;
	margin-left: 6px; text-transform: uppercase; letter-spacing: 0.5px;
}
.gl-footer {
	padding: 14px 20px;
	border-top: 1px solid #000;
	background: #16202d;
	display: flex; justify-content: space-between; align-items: center;
	gap: 12px;
}
.gl-footer-left { display: flex; align-items: center; gap: 8px; font-size: 13px; }
.gl-footer-left input { accent-color: #67c1f5; }
.gl-error {
	background: #4a1f1f; color: #ff8a8a; border: 1px solid #7a3030;
	padding: 12px 16px; margin: 16px; border-radius: 2px; font-size: 13px;
}
.gl-empty { padding: 40px; text-align: center; color: #8f98a0; }
`;

function injectStyle(doc: Document): void {
	if (doc.getElementById(STYLE_ID)) return;
	const s = doc.createElement('style');
	s.id = STYLE_ID;
	s.textContent = CSS;
	doc.head?.appendChild(s);
}

function escapeHtml(s: string): string {
	return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
}

function buildLoadingView(doc: Document): HTMLElement {
	const w = doc.createElement('div');
	w.className = 'gl-loading';
	w.innerHTML = `
		<div class="gl-spinner"></div>
		<div class="gl-loading-text">Buscando AppIDs...</div>
		<div class="gl-progress" data-progress>preparando...</div>
	`;
	return w;
}

function buildErrorView(doc: Document, message: string): HTMLElement {
	const w = doc.createElement('div');
	w.className = 'gl-error';
	w.textContent = message;
	return w;
}

function buildListView(doc: Document, items: DLCInfo[], state: { selected: Set<number> }): HTMLElement {
	const wrap = doc.createElement('div');
	wrap.style.cssText = 'display:flex; flex-direction:column; flex:1; overflow:hidden;';

	const toolbar = doc.createElement('div');
	toolbar.className = 'gl-toolbar';
	toolbar.innerHTML = `
		<button class="gl-btn gl-btn-secondary" data-action="all">Selecionar todos</button>
		<button class="gl-btn gl-btn-secondary" data-action="none">Limpar</button>
		<input type="text" class="gl-search" placeholder="Filtrar por nome ou AppID..." />
		<span style="color:#8f98a0; font-size:12px;" data-count></span>
	`;
	wrap.appendChild(toolbar);

	const tableWrap = doc.createElement('div');
	tableWrap.className = 'gl-table-wrap';
	const table = doc.createElement('table');
	table.className = 'gl-table';
	table.innerHTML = `
		<thead>
			<tr>
				<th class="gl-col-check">GREENLUMAR</th>
				<th class="gl-col-appid">APPID</th>
				<th class="gl-col-image"></th>
				<th>NOME</th>
			</tr>
		</thead>
		<tbody></tbody>
	`;
	const tbody = table.querySelector('tbody')!;
	tableWrap.appendChild(table);
	wrap.appendChild(tableWrap);

	function renderRows(filter: string) {
		const f = filter.trim().toLowerCase();
		tbody.innerHTML = '';
		let visible = 0;
		for (const it of items) {
			if (f && !it.name.toLowerCase().includes(f) && !String(it.appid).includes(f)) continue;
			visible++;
			const tr = doc.createElement('tr');
			if (it.isBase) tr.className = 'gl-base';
			tr.innerHTML = `
				<td class="gl-col-check">
					<input type="checkbox" class="gl-checkbox" data-appid="${it.appid}" ${state.selected.has(it.appid) ? 'checked' : ''} />
				</td>
				<td class="gl-col-appid">${it.appid}</td>
				<td class="gl-col-image"><img src="${escapeHtml(it.imageUrl)}" loading="lazy" onerror="this.style.opacity=0.2"/></td>
				<td>${escapeHtml(it.name)}${it.isBase ? '<span class="gl-base-tag">Jogo base</span>' : ''}</td>
			`;
			tbody.appendChild(tr);
		}
		const countEl = toolbar.querySelector('[data-count]') as HTMLElement;
		countEl.textContent = `${state.selected.size} de ${items.length} selecionados${f ? ` (${visible} visíveis)` : ''}`;
	}

	tbody.addEventListener('change', (e) => {
		const t = e.target as HTMLInputElement;
		if (!t.classList.contains('gl-checkbox')) return;
		const id = parseInt(t.dataset.appid ?? '0', 10);
		if (t.checked) state.selected.add(id);
		else state.selected.delete(id);
		const countEl = toolbar.querySelector('[data-count]') as HTMLElement;
		countEl.textContent = `${state.selected.size} de ${items.length} selecionados`;
	});

	toolbar.querySelector('[data-action="all"]')!.addEventListener('click', () => {
		items.forEach((it) => state.selected.add(it.appid));
		renderRows((toolbar.querySelector('.gl-search') as HTMLInputElement).value);
	});
	toolbar.querySelector('[data-action="none"]')!.addEventListener('click', () => {
		state.selected.clear();
		renderRows((toolbar.querySelector('.gl-search') as HTMLInputElement).value);
	});
	(toolbar.querySelector('.gl-search') as HTMLInputElement).addEventListener('input', (e) => {
		renderRows((e.target as HTMLInputElement).value);
	});

	renderRows('');
	return wrap;
}

export function openGreenLumarModal(doc: Document, appid: number, gameName?: string): void {
	injectStyle(doc);

	const overlay = doc.createElement('div');
	overlay.className = 'gl-overlay';

	const modal = doc.createElement('div');
	modal.className = 'gl-modal';
	overlay.appendChild(modal);

	const header = doc.createElement('div');
	header.className = 'gl-header';
	header.innerHTML = `
		<img src="${STEAM_ICON_BASE64}" alt="" />
		<h2>GreenLumar — ${escapeHtml(gameName ?? `App ${appid}`)}</h2>
		<div style="flex:1"></div>
		<button class="gl-btn gl-btn-secondary" data-close>Fechar</button>
	`;
	modal.appendChild(header);

	const body = doc.createElement('div');
	body.style.cssText = 'flex:1; display:flex; flex-direction:column; overflow:hidden;';
	modal.appendChild(body);

	const footer = doc.createElement('div');
	footer.className = 'gl-footer';
	footer.innerHTML = `
		<label class="gl-footer-left">
			<input type="checkbox" data-restart checked />
			Reiniciar Steam após GreenLumar
		</label>
		<button class="gl-btn gl-btn-confirm" data-confirm disabled>Confirmar</button>
	`;
	modal.appendChild(footer);

	const close = () => overlay.remove();
	overlay.addEventListener('click', (e) => { if (e.target === overlay) close(); });
	(header.querySelector('[data-close]') as HTMLElement).addEventListener('click', close);
	doc.addEventListener('keydown', function escHandler(e) {
		if (e.key === 'Escape') { close(); doc.removeEventListener('keydown', escHandler); }
	});

	doc.body.appendChild(overlay);

	const loading = buildLoadingView(doc);
	body.appendChild(loading);

	const state = { selected: new Set<number>(), items: [] as DLCInfo[] };

	const confirmBtn = footer.querySelector('[data-confirm]') as HTMLButtonElement;
	const restartCb = footer.querySelector('[data-restart]') as HTMLInputElement;

	function updateConfirm() {
		confirmBtn.disabled = state.selected.size === 0;
	}

	fetchGameAndDLCs(appid, (cur, total, status) => {
		const p = loading.querySelector('[data-progress]') as HTMLElement;
		if (total === 0) p.textContent = status;
		else p.textContent = `${cur} / ${total} • ${status}`;
	})
		.then((items) => {
			state.items = items;
			items.forEach((i) => state.selected.add(i.appid));
			body.removeChild(loading);
			body.appendChild(buildListView(doc, items, state));
			// Mostra contagem por fonte
			const counts: Record<string, number> = {};
			for (const it of items) {
				if (it.isBase) continue;
				const k = it.source || 'unknown';
				counts[k] = (counts[k] ?? 0) + 1;
			}
			console.log('[GreenLumar] DLCs por fonte:', counts);
			updateConfirm();
			body.addEventListener('change', updateConfirm);
		})
		.catch((err) => {
			body.removeChild(loading);
			body.appendChild(buildErrorView(doc, `Erro ao buscar DLCs: ${err?.message ?? err}`));
		});

	confirmBtn.addEventListener('click', async () => {
		if (state.selected.size === 0) return;
		confirmBtn.disabled = true;
		confirmBtn.textContent = 'Salvando...';
		try {
			const ids = Array.from(state.selected);
			const res = await saveAppids(JSON.stringify(ids));
			const parsed = typeof res === 'string' ? JSON.parse(res) : res;
			if (!parsed?.ok) throw new Error(parsed?.error ?? 'erro desconhecido');
			console.log('[GreenLumar] saved:', parsed);
			if (restartCb.checked) {
				confirmBtn.textContent = 'Reiniciando Steam...';
				await restartSteam();
			} else {
				close();
			}
		} catch (err: any) {
			confirmBtn.disabled = false;
			confirmBtn.textContent = 'Confirmar';
			alert(`Erro ao salvar: ${err?.message ?? err}`);
		}
	});
}
