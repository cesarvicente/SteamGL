import { findModule, Millennium, sleep } from '@steambrew/client';
import { STEAM_ICON_BASE64 } from './icon';
import { openGreenLumarModal } from './modal';
import { flog } from './flog';

declare const MainWindowBrowserManager: any;
declare const appStore: any;
declare const SteamUIStore: any;

const GREENLUMAR_BTN_CLASS = 'greenlumar-action-btn';

function getCurrentAppId(): number | null {
	try {
		const path = MainWindowBrowserManager?.m_lastLocation?.pathname || '';
		const m = path.match(/\/library\/app\/(\d+)/);
		if (m) return parseInt(m[1], 10);
	} catch {}
	return null;
}

function getGameName(appid: number): string | null {
	try {
		const overview = appStore?.GetAppOverviewByAppID?.(appid);
		return overview?.display_name ?? overview?.name ?? null;
	} catch {
		return null;
	}
}

async function injectButton(doc: Document, source: string): Promise<boolean> {
	try {
		const appid = getCurrentAppId();
		flog(`[GreenLumar] injectButton(${source}) appid=${appid}`);
		if (!appid) return false;

		const InPageMod = findModule((e: any) => e.InPage);
		const AppButtonsMod = findModule((e: any) => e.AppButtonsContainer);
		const MenuButtonMod = findModule((e: any) => e.MenuButtonContainer);

		if (!InPageMod || !AppButtonsMod || !MenuButtonMod) {
			flog('[GreenLumar] modules not found', { InPageMod: !!InPageMod, AppButtonsMod: !!AppButtonsMod, MenuButtonMod: !!MenuButtonMod });
			return false;
		}

		const selector = `div.${InPageMod.InPage} div.${AppButtonsMod.AppButtonsContainer} > div.${MenuButtonMod.MenuButtonContainer}:not([role="button"])`;
		const elements = await Millennium.findElement(doc, selector, 3000);
		const target = [...elements][0] as HTMLElement | undefined;

		if (!target) {
			flog('[GreenLumar] target MenuButtonContainer not found, selector:', selector);
			return false;
		}

		// Já existe?
		const parent = target.parentNode as HTMLElement;
		if (parent?.querySelector(`.${GREENLUMAR_BTN_CLASS}`)) {
			const existing = parent.querySelector(`.${GREENLUMAR_BTN_CLASS}`) as HTMLElement;
			if (existing.getAttribute('data-greenlumar-appid') === String(appid)) return true;
			existing.remove();
		}

		// Clona o botão (gear/info) pra herdar estilos
		const clone = target.cloneNode(true) as HTMLElement;
		clone.classList.add(GREENLUMAR_BTN_CLASS);
		clone.setAttribute('data-greenlumar-appid', String(appid));
		clone.setAttribute('title', 'GreenLumar');
		clone.setAttribute('aria-label', 'GreenLumar');

		// Substitui o ícone interno pela imagem base64
		const newImg = doc.createElement('img');
		newImg.src = STEAM_ICON_BASE64;
		newImg.style.cssText = 'width:18px;height:18px;object-fit:contain;display:block;flex-shrink:0;';
		newImg.alt = '';

		// Procura o SVG ou img dentro (geralmente dentro do firstChild que é um button)
		const inner = clone.querySelector('svg, img');
		if (inner) {
			inner.replaceWith(newImg);
		} else {
			// fallback: limpa firstChild e adiciona
			const fc = clone.firstChild as HTMLElement;
			if (fc) {
				fc.innerHTML = '';
				fc.appendChild(newImg);
			} else {
				clone.appendChild(newImg);
			}
		}

		// Garante centralização vertical/horizontal do ícone dentro do botão
		const innerBtn = clone.firstChild as HTMLElement | null;
		if (innerBtn && innerBtn.style) {
			innerBtn.style.display = 'flex';
			innerBtn.style.alignItems = 'center';
			innerBtn.style.justifyContent = 'center';
		}

		// Insere após o target (ao lado dos botões gear/info/favorite)
		parent.insertBefore(clone, target.nextSibling);

		// Click handler
		clone.addEventListener(
			'click',
			(e) => {
				e.preventDefault();
				e.stopPropagation();
				e.stopImmediatePropagation();
				const id = getCurrentAppId();
				if (!id) return;
				const name = getGameName(id) ?? undefined;
				flog('[GreenLumar] click! appid', id, 'name', name);
				openGreenLumarModal(doc, id, name);
			},
			true,
		);

		flog('[GreenLumar] BOTAO INJETADO! appid', appid);
		return true;
	} catch (e: any) {
		flog('[GreenLumar] erro injectButton:', e?.message ?? String(e));
		return false;
	}
}

function hookSPDesktop(popup: any): void {
	if (popup?.m_strName !== 'SP Desktop_uid0') return;
	const doc = popup?.m_popup?.document;
	if (!doc) return;

	flog('[GreenLumar] hooking SP Desktop_uid0');

	const onRequest = async () => {
		const path = MainWindowBrowserManager?.m_lastLocation?.pathname || '';
		flog('[GreenLumar] finished-request path:', path);
		if (path.startsWith('/library/app/')) {
			await sleep(150);
			await injectButton(doc, 'finished-request');
		}
	};

	try {
		MainWindowBrowserManager.m_browser.on('finished-request', onRequest);
		flog('[GreenLumar] finished-request listener registered');
	} catch (e: any) {
		flog('[GreenLumar] erro registrando listener:', e?.message ?? String(e));
	}

	// Tentativas iniciais e polling de fallback (a cada 2s, garantia de que o botão sempre apareça)
	setTimeout(() => injectButton(doc, 'init-500'), 500);
	setTimeout(() => injectButton(doc, 'init-2000'), 2000);
	setInterval(() => {
		const path = MainWindowBrowserManager?.m_lastLocation?.pathname || '';
		if (path.startsWith('/library/app/')) {
			injectButton(doc, 'poll');
		}
	}, 2000);
}

let globalHookSetup = false;

/** Mantida o nome antigo pra evitar mudar index.tsx. */
export function setupContextMenuHook(_doc: Document): void {
	if (globalHookSetup) return;
	globalHookSetup = true;
	// Apenas precisamos hookar UMA vez no SP Desktop_uid0 globalmente.
	(async () => {
		// @ts-ignore
		while (typeof MainWindowBrowserManager === 'undefined') {
			await sleep(100);
		}
		flog('[GreenLumar] MainWindowBrowserManager disponível');

		// @ts-ignore
		if (typeof g_PopupManager !== 'undefined') {
			// @ts-ignore
			const existing = g_PopupManager.GetExistingPopup?.('SP Desktop_uid0');
			if (existing) hookSPDesktop(existing);
			// @ts-ignore
			g_PopupManager.AddPopupCreatedCallback?.((p: any) => {
				if (p?.m_strName === 'SP Desktop_uid0') hookSPDesktop(p);
			});
		}
	})();
}
