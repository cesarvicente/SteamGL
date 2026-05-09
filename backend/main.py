import Millennium, PluginUtils  # type: ignore
import subprocess
import os
from datetime import datetime

logger = PluginUtils.Logger()
LOG_FILE = r"C:\Program Files (x86)\Steam\plugins\disable-play-button\debug.log"

def flog(msg):
    ts = datetime.now().strftime("%H:%M:%S.%f")[:-3]
    line = f"[{ts}] {msg}"
    logger.log(line)
    with open(LOG_FILE, "a", encoding="utf-8") as f:
        f.write(line + "\n")

def is_dll_injector_running():
    try:
        output = subprocess.check_output(
            ['tasklist', '/FI', 'IMAGENAME eq DLLInjector.exe'],
            creationflags=0x08000000,
            stderr=subprocess.DEVNULL
        )
        flog(f"tasklist output: {output[:200]}")
        result = b'DLLInjector.exe' in output
        flog(f"DLLInjector detected: {result}")
        return result
    except Exception as e:
        flog(f"process check error: {e}")
        return False

class Plugin:
    def _front_end_loaded(self):
        import time
        flog("_front_end_loaded called, waiting 5s for main window...")
        time.sleep(5)
        running = is_dll_injector_running()
        if running:
            try:
                flog("calling call_frontend_method('onDLLInjectorDetected')")
                Millennium.call_frontend_method("onDLLInjectorDetected")
                flog("call_frontend_method returned ok")
            except Exception as e:
                flog(f"call_frontend_method error: {e}")
        else:
            flog("DLLInjector NOT running, blocking disabled")

    def _load(self):
        flog("_load called")
        Millennium.ready()

    def _unload(self):
        flog("_unload called")
