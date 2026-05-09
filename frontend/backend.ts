declare const Millennium: any;

const PLUGIN_NAME = 'disable-play-button';

/**
 * Chama um método do backend Python.
 * Padrão correto: Millennium.callServerMethod(pluginName, methodName, params)
 * Retorna o valor retornado pela função Python.
 */
export async function callBackend<T = any>(method: string, params: Record<string, any> = {}): Promise<T | null> {
	try {
		const r = await Millennium.callServerMethod(PLUGIN_NAME, method, params);
		return r as T;
	} catch (e) {
		console.warn('[GreenLumar] callBackend error:', method, e);
		return null;
	}
}
