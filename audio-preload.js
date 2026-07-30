const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('electronMusic', {
  play:      (src, time, vol) => ipcRenderer.invoke('emus-play', { src, time, vol }),
  pause:     ()               => ipcRenderer.invoke('emus-pause'),
  resume:    ()               => ipcRenderer.invoke('emus-resume'),
  setVolume: (vol)            => ipcRenderer.invoke('emus-volume', vol),
  getState:  ()               => ipcRenderer.invoke('emus-state'),
});
