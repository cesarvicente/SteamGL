import Millennium, PluginUtils  # type: ignore
import subprocess
import os
import json
import threading
import time
from datetime import datetime

logger = PluginUtils.Logger()
LOG_FILE = r"C:\Program Files (x86)\Steam\plugins\gl-easytool\debug.log"
STEAM_DIR = r"C:\Program Files (x86)\Steam"
APPLIST_DIR = os.path.join(STEAM_DIR, "AppList")
DLLINJECTOR = os.path.join(STEAM_DIR, "DLLInjector.exe")

CREATE_NO_WINDOW = 0x08000000


def flog(msg):
    ts = datetime.now().strftime("%H:%M:%S.%f")[:-3]
    line = f"[{ts}] {msg}"
    logger.log(line)
    try:
        with open(LOG_FILE, "a", encoding="utf-8") as f:
            f.write(line + "\n")
    except Exception:
        pass


def is_dll_injector_running():
    try:
        output = subprocess.check_output(
            ['tasklist', '/FI', 'IMAGENAME eq DLLInjector.exe'],
            creationflags=CREATE_NO_WINDOW,
            stderr=subprocess.DEVNULL
        )
        return b'DLLInjector.exe' in output
    except Exception as e:
        flog(f"process check error: {e}")
        return False


def next_file_index(folder):
    """Retorna o proximo indice baseado nos arquivos N.txt ja existentes."""
    if not os.path.isdir(folder):
        return 1
    max_idx = 0
    for name in os.listdir(folder):
        base, ext = os.path.splitext(name)
        if ext.lower() == ".txt" and base.isdigit():
            n = int(base)
            if n > max_idx:
                max_idx = n
    return max_idx + 1


FRONTEND_LOG = r"C:\Program Files (x86)\Steam\plugins\gl-easytool\frontend.log"


class Backend:
    @staticmethod
    def fe_log(msg):
        """Recebe logs do frontend e grava em arquivo."""
        try:
            ts = datetime.now().strftime("%H:%M:%S.%f")[:-3]
            with open(FRONTEND_LOG, "a", encoding="utf-8") as f:
                f.write(f"[{ts}] {msg}\n")
            return "ok"
        except Exception as e:
            return f"err: {e}"

    @staticmethod
    def save_appids(appids_json):
        """Salva uma lista de AppIDs em arquivos N.txt na pasta AppList.

        appids_json: string JSON com array de AppIDs (numeros ou strings)
        Retorna: JSON {"ok": true, "saved": [...], "start": N, "end": M}
        """
        try:
            appids = json.loads(appids_json)
            os.makedirs(APPLIST_DIR, exist_ok=True)
            start = next_file_index(APPLIST_DIR)
            saved = []
            for offset, appid in enumerate(appids):
                idx = start + offset
                path = os.path.join(APPLIST_DIR, f"{idx}.txt")
                with open(path, "w", encoding="utf-8") as f:
                    f.write(str(appid).strip())
                saved.append({"index": idx, "appid": str(appid), "path": path})
            end = start + len(saved) - 1 if saved else start - 1
            flog(f"save_appids: saved {len(saved)} appids to {APPLIST_DIR} (files {start}..{end})")
            return json.dumps({"ok": True, "saved": saved, "start": start, "end": end, "folder": APPLIST_DIR})
        except Exception as e:
            flog(f"save_appids error: {e}")
            return json.dumps({"ok": False, "error": str(e)})

    @staticmethod
    def restart_steam_via_dllinjector():
        """Spawna um VBS desacoplado (invisivel) que mata a Steam e abre o DLLInjector.

        Necessario porque ao matar a Steam, o backend Python morre junto.
        O VBS via wscript roda em background sem janela alguma.
        """
        try:
            if not os.path.isfile(DLLINJECTOR):
                flog(f"DLLInjector not found at {DLLINJECTOR}")
                return json.dumps({"ok": False, "error": f"DLLInjector not found at {DLLINJECTOR}"})

            # WScript.Shell.Run com style=0 = SW_HIDE (invisivel)
            steam_dir_vbs = STEAM_DIR.replace('"', '""')
            dll_vbs = DLLINJECTOR.replace('"', '""')
            vbs = (
                'Set sh = CreateObject("WScript.Shell")\n'
                'sh.Run "taskkill /F /IM steam.exe", 0, True\n'
                'sh.Run "taskkill /F /IM steamwebhelper.exe", 0, True\n'
                'WScript.Sleep 3000\n'
                f'sh.CurrentDirectory = "{steam_dir_vbs}"\n'
                f'sh.Run """{dll_vbs}""", 1, False\n'
            )
            tmp = os.environ.get('TEMP', r'C:\Windows\Temp')
            vbs_path = os.path.join(tmp, 'greenlumar_relaunch.vbs')
            with open(vbs_path, 'w', encoding='utf-8') as f:
                f.write(vbs)

            DETACHED_PROCESS = 0x00000008
            CREATE_BREAKAWAY_FROM_JOB = 0x01000000
            flags = DETACHED_PROCESS | CREATE_BREAKAWAY_FROM_JOB

            subprocess.Popen(
                ['wscript.exe', '//B', '//Nologo', vbs_path],
                cwd=STEAM_DIR,
                creationflags=flags,
                close_fds=True,
                stdin=subprocess.DEVNULL,
                stdout=subprocess.DEVNULL,
                stderr=subprocess.DEVNULL,
            )
            flog("VBS relaunch spawned (detached, hidden)")
            return json.dumps({"ok": True})
        except Exception as e:
            flog(f"restart_steam error: {e}")
            return json.dumps({"ok": False, "error": str(e)})


def _delayed_dll_check():
    """Roda em thread separada — bloquear o _front_end_loaded trava o Millennium."""
    flog("_delayed_dll_check thread started, waiting 5s for main window...")
    time.sleep(5)
    running = is_dll_injector_running()
    flog(f"DLLInjector detected: {running}")
    if running:
        try:
            Millennium.call_frontend_method("onDLLInjectorDetected")
            flog("onDLLInjectorDetected dispatched")
        except Exception as e:
            flog(f"call_frontend_method error: {e}")


class Plugin:
    def _front_end_loaded(self):
        flog("_front_end_loaded called, scheduling DLL check in background thread")
        threading.Thread(target=_delayed_dll_check, daemon=True).start()

    def _load(self):
        flog("_load called")
        try:
            with open(FRONTEND_LOG, "w", encoding="utf-8") as f:
                f.write(f"=== _load at {datetime.now()} ===\n")
        except Exception as e:
            flog(f"frontend log create error: {e}")
        Millennium.ready()

    def _unload(self):
        flog("_unload called")
