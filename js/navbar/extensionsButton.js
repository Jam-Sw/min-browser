var extensionsButton = {
  extensions: [],
  initialize: function () {
    this.toolbar = document.getElementById('extensions-toolbar')
    this.button = document.getElementById('extensions-button')
    this.iconContainer = document.getElementById('extensions-icons')

    if (!this.toolbar || !this.button || !this.iconContainer) {
      return
    }

    window.addEventListener('message', this.handleMessage.bind(this))
    window.addEventListener('focus', this.requestExtensions.bind(this))
    this.button.addEventListener('click', () => {
      ipc.send('addTab', { url: 'min://app/pages/settings/index.html#extensions' })
      this.requestExtensions()
    })

    // show immediately even before data arrives
    if (this.toolbar) {
      this.toolbar.hidden = false
    }

    // initial load
    this.requestExtensions()
  },
  requestExtensions: function () {
    window.postMessage({ message: 'getExtensions' }, '*')
  },
  handleMessage: function (e) {
    if (!e.data || e.data.message !== 'extensionsData') {
      return
    }
    if (!e.data.data || !e.data.data.extensions) {
      return
    }

    this.extensions = e.data.data.extensions.filter(ext => ext.enabled)
    this.render()
  },
  pickIconPath: function (icons) {
    if (!icons) return null
    const order = ['32', '24', '48', '64', '128', '16']
    for (const size of order) {
      if (icons[size]) return icons[size]
    }
    const first = Object.keys(icons)[0]
    return icons[first]
  },
  render: function () {
    if (!this.toolbar) return

    empty(this.iconContainer)

    // Always show the toolbar to expose the settings button
    this.toolbar.hidden = false

    this.extensions.forEach(ext => {
      const btn = document.createElement('button')
      btn.classList.add('extension-icon-button')
      btn.title = ext.defaultTitle || ext.name || 'Extension'
      btn.setAttribute('aria-label', btn.title)

      const iconPath = this.pickIconPath(ext.icons)
      if (iconPath) {
        const img = document.createElement('img')
        img.src = `chrome-extension://${ext.id}/${iconPath}`
        img.alt = ''
        btn.appendChild(img)
      } else if (ext.name) {
        btn.textContent = ext.name.substring(0, 2).toUpperCase()
      }

      btn.addEventListener('click', (ev) => {
        ev.stopPropagation()
        this.handleExtensionClick(ext)
      })

      this.iconContainer.appendChild(btn)
    })
  },
  handleExtensionClick: function (ext) {
    let targetPath = ext.defaultPopup || ext.optionsPage
    if (targetPath) {
      if (!targetPath.startsWith('chrome-extension://')) {
        targetPath = `chrome-extension://${ext.id}/${targetPath}`
      }
      ipc.send('addTab', { url: targetPath })
      return
    }

    // fallback: open extensions settings
    ipc.send('addTab', { url: 'min://app/pages/settings/index.html#extensions' })
  }
}

module.exports = extensionsButton