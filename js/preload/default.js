/* imports common modules */

var electron = require('electron')
var ipc = electron.ipcRenderer

var propertiesToClone = ['deltaX', 'deltaY', 'metaKey', 'ctrlKey', 'defaultPrevented', 'clientX', 'clientY']

function cloneEvent (e) {
  var obj = {}

  for (var i = 0; i < propertiesToClone.length; i++) {
    obj[propertiesToClone[i]] = e[propertiesToClone[i]]
  }
  return JSON.stringify(obj)
}

// workaround for Electron bug
setTimeout(function () {
  /* Used for swipe gestures */
  window.addEventListener('wheel', function (e) {
    ipc.send('wheel-event', cloneEvent(e))
  })

  var scrollTimeout = null

  window.addEventListener('scroll', function () {
    clearTimeout(scrollTimeout)
    scrollTimeout = setTimeout(function () {
      ipc.send('scroll-position-change', Math.round(window.scrollY))
    }, 200)
  })
}, 0)

/* Used for picture in picture item in context menu */
ipc.on('getContextMenuData', function (event, data) {
  // check for video element to show picture-in-picture menu
  var hasVideo = Array.from(document.elementsFromPoint(data.x, data.y)).some(el => el.tagName === 'VIDEO')
  ipc.send('contextMenuData', { hasVideo })
})

ipc.on('enterPictureInPicture', function (event, data) {
  var videos = Array.from(document.elementsFromPoint(data.x, data.y)).filter(el => el.tagName === 'VIDEO')
  if (videos[0]) {
    videos[0].requestPictureInPicture()
  }
})

window.addEventListener('message', function (e) {
  if (!e.origin.startsWith('min://')) {
    return
  }

  if (e.data?.message === 'showCredentialList') {
    ipc.send('showCredentialList')
  }

  if (e.data?.message === 'showUserscriptDirectory') {
    ipc.send('showUserscriptDirectory')
  }

  if (e.data?.message === 'downloadFile') {
    ipc.send('downloadFile', e.data.url)
  }

  if (e.data?.message === 'getExtensions') {
    const targetOrigin = e.origin
    ipc.invoke('extensions:list').then(function (result) {
      window.postMessage({ message: 'extensionsData', data: result }, targetOrigin)
    }).catch(function (err) {
      window.postMessage({ message: 'extensionsData', data: { success: false, error: err.message } }, targetOrigin)
    })
  }

  if (e.data?.message === 'addExtension') {
    const targetOrigin = e.origin
    ipc.invoke('extensions:add', { path: e.data.path }).then(function (result) {
      window.postMessage({ message: 'extensionsData', data: result }, targetOrigin)
    }).catch(function (err) {
      window.postMessage({ message: 'extensionsData', data: { success: false, error: err.message } }, targetOrigin)
    })
  }

  if (e.data?.message === 'toggleExtension') {
    const targetOrigin = e.origin
    ipc.invoke('extensions:toggle', { id: e.data.id, path: e.data.path, enabled: e.data.enabled }).then(function (result) {
      window.postMessage({ message: 'extensionsData', data: result }, targetOrigin)
    }).catch(function (err) {
      window.postMessage({ message: 'extensionsData', data: { success: false, error: err.message } }, targetOrigin)
    })
  }

  if (e.data?.message === 'removeExtension') {
    const targetOrigin = e.origin
    ipc.invoke('extensions:remove', { id: e.data.id, path: e.data.path }).then(function (result) {
      window.postMessage({ message: 'extensionsData', data: result }, targetOrigin)
    }).catch(function (err) {
      window.postMessage({ message: 'extensionsData', data: { success: false, error: err.message } }, targetOrigin)
    })
  }
})
