import { definePlugin, Plugin, sleep } from '@steambrew/client';
import React from 'react';

declare const g_PopupManager: any;

const PLAY_TEXTS = ['jogar', 'play', 'jugar', 'jouer', 'spielen', 'играть'];

// Busca texto apenas nos nós de texto diretos, ignorando ícones SVG
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

function hidePlayButtons(doc: Document): void {
	// Cobre tanto <button> quanto <div role="button"> (que é como o Steam renderiza o botão Jogar)
	const all = doc.querySelectorAll<Element>('button, [role="button"], [class*="gameactionbutton"]');
	all.forEach((el) => {
		if (isPlayElement(el)) {
			(el as HTMLElement).style.setProperty('display', 'none', 'important');
			// Também esconde o container pai imediato se for o wrapper do botão
			const parent = el.parentElement;
			if (parent && isPlayElement(parent)) {
				parent.style.setProperty('display', 'none', 'important');
			}
		}
	});
}

function watchDocument(doc: Document): void {
	hidePlayButtons(doc);
	let timer: ReturnType<typeof setTimeout>;
	const observer = new MutationObserver(() => {
		clearTimeout(timer);
		timer = setTimeout(() => hidePlayButtons(doc), 100);
	});
	const start = () => observer.observe(doc.body, { childList: true, subtree: true });
	if (doc.body) start();
	else doc.addEventListener('DOMContentLoaded', start);
}

export default definePlugin(async (): Promise<Plugin> => {
	console.log('[dpb] plugin starting');

	while (typeof g_PopupManager === 'undefined') {
		await sleep(100);
	}

	g_PopupManager.m_mapPopups?.data_?.forEach((entry: any) => {
		const popup = entry.value_;
		if (popup?.m_popup?.document) {
			watchDocument(popup.m_popup.document);
		}
	});

	g_PopupManager.AddPopupCreatedCallback((popup: any) => {
		if (popup?.m_popup?.document) {
			watchDocument(popup.m_popup.document);
		}
	});

	return { icon: <span>🚫</span> };
});
