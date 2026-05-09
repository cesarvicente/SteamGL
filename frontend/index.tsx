import { definePlugin, Plugin, sleep } from '@steambrew/client';
import React from 'react';

declare const g_PopupManager: any;

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

function getVisibleText(el: Element): string {
	return Array.from(el.childNodes)
		.filter((n) => n.nodeType === Node.TEXT_NODE || (n.nodeType === Node.ELEMENT_NODE && (n as Element).tagName !== 'SVG'))
		.map((n) => n.textContent ?? '')
		.join('')
		.trim()
		.toLowerCase();
}

function isPlayElement(el: Element): boolean {
	const text = getVisibleText(el);
	const full = (el.textContent ?? '').trim().toLowerCase();
	const candidate = text.length > 0 ? text : full;
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
	doc.querySelectorAll<Element>('button, [role="button"], [class*="gameactionbutton"]').forEach((el) => {
		if (isPlayElement(el) && !el.classList.contains(DISABLED_CLASS)) {
			el.classList.add(DISABLED_CLASS);
			// Bloqueia cliques no capture phase, antes do React processar
			el.addEventListener('click', (e) => {
				e.preventDefault();
				e.stopPropagation();
				e.stopImmediatePropagation();
			}, true);
		}
	});
}

function watchDocument(doc: Document): void {
	injectStyle(doc);
	disablePlayButtons(doc);
	let timer: ReturnType<typeof setTimeout>;
	const observer = new MutationObserver(() => {
		clearTimeout(timer);
		timer = setTimeout(() => disablePlayButtons(doc), 100);
	});
	const start = () => observer.observe(doc.body, { childList: true, subtree: true });
	if (doc.body) start();
	else doc.addEventListener('DOMContentLoaded', start);
}

export default definePlugin(async (): Promise<Plugin> => {
	while (typeof g_PopupManager === 'undefined') {
		await sleep(100);
	}

	g_PopupManager.m_mapPopups?.data_?.forEach((entry: any) => {
		const popup = entry.value_;
		if (popup?.m_popup?.document) watchDocument(popup.m_popup.document);
	});

	g_PopupManager.AddPopupCreatedCallback((popup: any) => {
		if (popup?.m_popup?.document) watchDocument(popup.m_popup.document);
	});

	return { icon: <span>🚫</span> };
});
