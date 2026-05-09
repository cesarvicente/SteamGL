import { definePlugin, Plugin, sleep } from '@steambrew/client';
import React from 'react';
import { setupContextMenuHook } from './menu';
import { flog } from './flog';
import { callBackend } from './backend';

declare const g_PopupManager: any;
declare const MainWindowBrowserManager: any;

const allowedAppIds = new Set<number>();

async function loadAllowList(): Promise<void> {
	try {
		const r = await callBackend<string>('Backend.get_applist');
		const ids = typeof r === 'string' ? JSON.parse(r) : r;
		if (Array.isArray(ids)) {
			ids.forEach((id) => allowedAppIds.add(id));
			flog('[GL EasyTool] AppList carregada:', allowedAppIds.size, 'appids');
		}
	} catch (e: any) {
		flog('[GL EasyTool] erro carregando AppList:', e?.message ?? String(e));
	}
}

function getCurrentAppId(): number | null {
	try {
		const path = MainWindowBrowserManager?.m_lastLocation?.pathname || '';
		const m = path.match(/\/library\/app\/(\d+)/);
		if (m) return parseInt(m[1], 10);
	} catch {}
	return null;
}

const DISABLED_CLASS = 'millennium_disabled_play';
const PLAY_TEXTS = ['jogar', 'play', 'jugar', 'jouer', 'spielen', 'играть'];

const CSS = `
.${DISABLED_CLASS} {
    position: relative !important;
    filter: grayscale(1) !important;
    opacity: 0.45 !important;
}
.${DISABLED_CLASS}::before {
    content: '';
    position: absolute;
    inset: 0;
    cursor: not-allowed;
    z-index: 9999;
}
`;

let blockingEnabled = false;
const watchedDocs = new Set<Document>();

function blockEvent(e: Event): void {
	if (!blockingEnabled) return;
	e.preventDefault();
	e.stopPropagation();
	e.stopImmediatePropagation();
}

function getVisibleText(el: Element): string {
	return Array.from(el.childNodes)
		.filter((n) => n.nodeType === Node.TEXT_NODE || (n.nodeType === Node.ELEMENT_NODE && (n as Element).tagName !== 'SVG'))
		.map((n) => n.textContent ?? '')
		.join('')
		.trim()
		.toLowerCase();
}

function isPlayElement(el: Element): boolean {
	// Não bloqueia o nosso próprio item GreenLumar
	if (el.getAttribute('data-greenlumar-injected') === '1') return false;
	const text = getVisibleText(el);
	const full = (el.textContent ?? '').trim().toLowerCase();
	const candidate = text.length > 0 ? text : full;
	if (candidate.includes('greenlumar')) return false;
	return candidate.length <= 30 && PLAY_TEXTS.some((pt) => candidate === pt || candidate.includes(pt));
}

function injectStyle(doc: Document): void {
	if (doc.getElementById('millennium-disable-play-style')) return;
	const style = doc.createElement('style');
	style.id = 'millennium-disable-play-style';
	style.textContent = CSS;
	doc.head?.appendChild(style);
}

function disablePlayButtons(doc: Document): void {
	// Se o jogo atual está na allowlist (AppID salvo via GreenLumar), não bloqueia
	const currentAppId = getCurrentAppId();
	if (currentAppId !== null && allowedAppIds.has(currentAppId)) return;

	const selector = 'button, [role="button"], [role="menuitem"], [class*="gameactionbutton"]';
	doc.querySelectorAll<Element>(selector).forEach((el) => {
		if (isPlayElement(el) && !el.classList.contains(DISABLED_CLASS)) {
			el.classList.add(DISABLED_CLASS);
			el.addEventListener('click', blockEvent, true);
			el.addEventListener('dblclick', blockEvent, true);
		}
	});
}

function applyToDoc(doc: Document, enabled: boolean): void {
	if (enabled) {
		injectStyle(doc);
		disablePlayButtons(doc);
	} else {
		doc.querySelectorAll<Element>(`.${DISABLED_CLASS}`).forEach((el) => {
			el.classList.remove(DISABLED_CLASS);
		});
	}
}

function setBlocking(enabled: boolean): void {
	if (blockingEnabled === enabled) return;
	blockingEnabled = enabled;
	watchedDocs.forEach((doc) => applyToDoc(doc, enabled));
}

function watchDocument(doc: Document): void {
	if (watchedDocs.has(doc)) return;
	watchedDocs.add(doc);
	injectStyle(doc);
	doc.addEventListener('dblclick', blockEvent, true);
	if (blockingEnabled) disablePlayButtons(doc);
	setupContextMenuHook(doc);
	let timer: ReturnType<typeof setTimeout>;
	const observer = new MutationObserver(() => {
		clearTimeout(timer);
		timer = setTimeout(() => {
			if (blockingEnabled) disablePlayButtons(doc);
		}, 100);
	});
	const start = () => observer.observe(doc.body, { childList: true, subtree: true });
	if (doc.body) start();
	else doc.addEventListener('DOMContentLoaded', start);
}

export default definePlugin(async (): Promise<Plugin> => {
	console.log('[gl-easytool] plugin starting');
	flog('[GL EasyTool] PLUGIN INICIADO no contexto', (window as any).location?.href || 'unknown');

	// Registra ANTES de qualquer await: o Object.assign do loader já criou
	// PLUGIN_LIST['gl-easytool'] antes de chamar e.default(), então
	// podemos setar aqui e call_frontend_method() vai encontrar no contexto correto.
	(window as any).PLUGIN_LIST['gl-easytool'].onDLLInjectorDetected = () => {
		console.log('[gl-easytool] onDLLInjectorDetected called, enabling blocking');
		setBlocking(true);
	};

	// Carrega a allowlist em background (não bloqueia o startup do plugin)
	loadAllowList();

	while (typeof g_PopupManager === 'undefined') {
		await sleep(100);
	}

	g_PopupManager.m_mapPopups?.data_?.forEach((entry: any) => {
		const popup = entry.value_;
		const doc = popup?.m_popup?.document;
		if (doc) {
			flog('[GreenLumar] popup existente:', popup?.m_strName || 'unknown', 'url:', doc.URL);
			watchDocument(doc);
		}
	});

	g_PopupManager.AddPopupCreatedCallback((popup: any) => {
		const doc = popup?.m_popup?.document;
		if (doc) {
			flog('[GreenLumar] novo popup:', popup?.m_strName || 'unknown', 'url:', doc.URL);
			watchDocument(doc);
		}
	});

	const settingsContent = (
		<div style={{ padding: '20px', color: '#c7d5e0', fontFamily: 'Motiva Sans, Arial, sans-serif' }}>
			<h2 style={{ color: '#fff', margin: '0 0 16px' }}>GL EasyTool</h2>
			<p style={{ margin: '0 0 12px', lineHeight: 1.5 }}>
				Adiciona um botão <strong style={{ color: '#5ba32b' }}>GreenLumar</strong> à página de
				cada jogo da biblioteca, ao lado dos ícones de configurações. Permite selecionar
				DLCs do jogo e salvar seus AppIDs em <code>AppList/</code>.
			</p>
			<h3 style={{ color: '#fff', margin: '20px 0 8px', fontSize: '14px' }}>Pasta de saída</h3>
			<div style={{ background: '#16202d', padding: '12px', borderRadius: 4, fontFamily: 'Consolas, monospace', fontSize: 13 }}>
				<span style={{ color: '#67c1f5' }}>C:\Program Files (x86)\Steam\AppList</span>
			</div>
			<h3 style={{ color: '#fff', margin: '20px 0 8px', fontSize: '14px' }}>Como usar</h3>
			<ol style={{ margin: 0, paddingLeft: 20, lineHeight: 1.6 }}>
				<li>Clique em qualquer jogo da biblioteca</li>
				<li>Clique no botão verde <strong>GreenLumar</strong> (ao lado do coração)</li>
				<li>Selecione as DLCs desejadas e confirme</li>
			</ol>
		</div>
	);

	return {
		title: 'GL EasyTool',
		icon: <span style={{ fontSize: '14px' }}>🟢</span>,
		content: settingsContent,
	} as unknown as Plugin;
});
