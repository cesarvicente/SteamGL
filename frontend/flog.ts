import { callBackend } from './backend';

let counter = 0;

/** Loga no console + manda pro backend gravar em arquivo + localStorage. */
export function flog(...args: any[]): void {
	counter++;
	const text = args
		.map((a) => {
			if (typeof a === 'string') return a;
			try {
				return JSON.stringify(a, (_k, v) => {
					if (v instanceof Element) return `<${v.tagName} class="${v.className}">`;
					if (v instanceof Set) return `Set(${v.size})`;
					if (v instanceof Map) return `Map(${v.size})`;
					return v;
				}).slice(0, 500);
			} catch {
				return String(a);
			}
		})
		.join(' ');
	try {
		console.log(text);
	} catch {}
	try {
		const ls = (window as any).localStorage;
		if (ls) {
			const key = `greenlumar_log_${counter % 200}`;
			ls.setItem(key, `[${new Date().toISOString().substr(11, 12)}] ${text}`);
			ls.setItem('greenlumar_counter', String(counter));
		}
	} catch {}
	callBackend('Backend.fe_log', { msg: text }).catch(() => {});
}
