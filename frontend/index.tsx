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
	watchedDocs.add(doc);
	injectStyle(doc);
	doc.addEventListener('dblclick', blockEvent, true);
	if (blockingEnabled) disablePlayButtons(doc);
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
	console.log('[disable-play-button] plugin starting');

	// Registra ANTES de qualquer await: o Object.assign do loader já criou
	// PLUGIN_LIST['disable-play-button'] antes de chamar e.default(), então
	// podemos setar aqui e call_frontend_method() vai encontrar no contexto correto.
	(window as any).PLUGIN_LIST['disable-play-button'].onDLLInjectorDetected = () => {
		console.log('[disable-play-button] onDLLInjectorDetected called, enabling blocking');
		setBlocking(true);
	};

	while (typeof g_PopupManager === 'undefined') {
		await sleep(100);
	}

	g_PopupManager.m_mapPopups?.data_?.forEach((entry: any) => {
		const popup = entry.value_;
		const doc = popup?.m_popup?.document;
		if (doc) {
			console.log('[disable-play-button] existing popup:', popup?.m_strName || 'unknown');
			watchDocument(doc);
		}
	});

	g_PopupManager.AddPopupCreatedCallback((popup: any) => {
		const doc = popup?.m_popup?.document;
		if (doc) {
			console.log('[disable-play-button] new popup:', popup?.m_strName || 'unknown');
			watchDocument(doc);
		}
	});

	return { icon: <span>🚫</span> } as unknown as Plugin;
});
