/* global app, session, settings, fs, path, ipc, dialog */

const EXTENSIONS_SETTINGS_KEY = 'extensions'
const EXTENSION_PARTITION = 'persist:webcontent'

let installedExtensions = []
let targetSession = null
const loadedExtensions = new Map()

function getTargetSession () {
  if (!targetSession) {
    targetSession = session.fromPartition(EXTENSION_PARTITION)
  }
  return targetSession
}

function sanitizeStoredExtensions (value) {
  if (!Array.isArray(value)) {
    return []
  }

  return value
    .filter(item => item && item.path)
    .map(item => {
      return {
        id: item.id,
        path: item.path,
        enabled: item.enabled !== false,
        name: item.name,
        version: item.version,
        manifestVersion: item.manifestVersion,
        description: item.description,
        lastError: item.lastError || null,
        icons: item.icons || null,
        defaultTitle: item.defaultTitle,
        defaultPopup: item.defaultPopup,
        optionsPage: item.optionsPage
      }
    })
}

function serializeExtensions () {
  return installedExtensions.map(ext => ({
    id: ext.id,
    path: ext.path,
    enabled: ext.enabled !== false,
    name: ext.name,
    version: ext.version,
    manifestVersion: ext.manifestVersion,
    description: ext.description,
    lastError: ext.lastError || null,
    icons: ext.icons || null,
    defaultTitle: ext.defaultTitle,
    defaultPopup: ext.defaultPopup,
    optionsPage: ext.optionsPage,
    loaded: ext.id ? loadedExtensions.has(ext.id) && ext.enabled !== false : false
  }))
}

function persistExtensions () {
  settings.set(EXTENSIONS_SETTINGS_KEY, installedExtensions)
}

function validateExtensionPath (extensionPath) {
  if (!extensionPath) {
    throw new Error('No extension path provided')
  }

  if (!fs.existsSync(extensionPath)) {
    throw new Error('Extension path does not exist')
  }

  const stats = fs.statSync(extensionPath)
  if (!stats.isDirectory()) {
    throw new Error('Extension path must be a directory')
  }

  const manifestPath = path.join(extensionPath, 'manifest.json')
  if (!fs.existsSync(manifestPath)) {
    throw new Error('manifest.json was not found in the selected folder')
  }
}

async function loadExtensionEntry (entry) {
  const ses = getTargetSession()

  if (entry.id && loadedExtensions.has(entry.id)) {
    try {
      ses.removeExtension(entry.id)
    } catch (e) {}
    loadedExtensions.delete(entry.id)
  }

  const loaded = await ses.loadExtension(entry.path, { allowFileAccess: true })

  entry.id = loaded.id
  entry.name = loaded.name
  entry.version = loaded.version
  entry.manifestVersion = loaded.manifestVersion
  entry.description = loaded.manifest?.description
  entry.icons = normalizeIcons(loaded.manifest)
  entry.defaultTitle = loaded.manifest?.action?.default_title || loaded.manifest?.browser_action?.default_title || loaded.name
  entry.defaultPopup = loaded.manifest?.action?.default_popup || loaded.manifest?.browser_action?.default_popup || null
  entry.optionsPage = loaded.manifest?.options_ui?.page || loaded.manifest?.options_page || null
  entry.enabled = true
  entry.lastError = null

  loadedExtensions.set(entry.id, entry.path)
  return loaded
}

function normalizeIcons (manifest) {
  if (!manifest) return null

  const getIconObject = (iconDef) => {
    if (!iconDef) return null
    if (typeof iconDef === 'string') {
      return { '16': iconDef }
    }
    if (typeof iconDef === 'object') {
      return iconDef
    }
    return null
  }

  return getIconObject(manifest.action?.default_icon) ||
    getIconObject(manifest.browser_action?.default_icon) ||
    getIconObject(manifest.icons) || null
}

async function ensureExtensionsLoadedAtStartup () {
  installedExtensions = sanitizeStoredExtensions(settings.get(EXTENSIONS_SETTINGS_KEY))

  for (const entry of installedExtensions) {
    if (entry.enabled === false) {
      continue
    }

    try {
      await loadExtensionEntry(entry)
    } catch (e) {
      entry.lastError = e.message
      entry.enabled = false
      console.warn('Failed to load extension', entry.path, e)
    }
  }

  persistExtensions()
}

function findExtension (id, extensionPath) {
  return installedExtensions.find(ext => (id && ext.id === id) || (extensionPath && ext.path === extensionPath))
}

async function addOrEnableExtensionFromPath (extensionPath) {
  validateExtensionPath(extensionPath)

  // Remove any existing entry with the same path or id
  installedExtensions = installedExtensions.filter(ext => ext.path !== extensionPath)

  const entry = {
    path: extensionPath,
    enabled: true
  }

  try {
    await loadExtensionEntry(entry)
  } catch (e) {
    entry.lastError = e.message
    entry.enabled = false
    // still store the entry so we can show the error in the UI
  }

  // Remove other entries with the same id (updated version of an installed extension)
  if (entry.id) {
    installedExtensions = installedExtensions.filter(ext => ext.id !== entry.id)
  }

  installedExtensions.push(entry)
  persistExtensions()

  return entry
}

async function disableExtension (entry) {
  if (!entry) {
    return
  }

  entry.enabled = false

  if (entry.id && loadedExtensions.has(entry.id)) {
    try {
      getTargetSession().removeExtension(entry.id)
    } catch (e) {}
    loadedExtensions.delete(entry.id)
  }

  persistExtensions()
}

async function removeExtension (entry) {
  if (!entry) {
    return
  }

  if (entry.id && loadedExtensions.has(entry.id)) {
    try {
      getTargetSession().removeExtension(entry.id)
    } catch (e) {}
    loadedExtensions.delete(entry.id)
  }

  installedExtensions = installedExtensions.filter(ext => ext !== entry)
  persistExtensions()
}

const extensionsReady = app.whenReady().then(function () {
  getTargetSession() // ensure the browsing session exists before we start loading extensions
  return ensureExtensionsLoadedAtStartup()
})

ipc.handle('extensions:list', async function () {
  await extensionsReady
  return { extensions: serializeExtensions() }
})

ipc.handle('extensions:add', async function (e, data = {}) {
  await extensionsReady

  let extensionPath = data.path

  if (!extensionPath) {
    const result = await dialog.showOpenDialog({
      properties: ['openDirectory']
    })

    if (result.canceled || result.filePaths.length === 0) {
      return { cancelled: true, extensions: serializeExtensions() }
    }

    extensionPath = result.filePaths[0]
  }

  try {
    await addOrEnableExtensionFromPath(extensionPath)
    return { success: true, extensions: serializeExtensions() }
  } catch (err) {
    return { success: false, error: err.message, extensions: serializeExtensions() }
  }
})

ipc.handle('extensions:toggle', async function (e, data = {}) {
  await extensionsReady

  const entry = findExtension(data.id, data.path)
  if (!entry) {
    return { success: false, error: 'Extension not found', extensions: serializeExtensions() }
  }

  const shouldEnable = data.enabled !== false

  if (!shouldEnable) {
    await disableExtension(entry)
    return { success: true, extensions: serializeExtensions() }
  }

  entry.enabled = true
  try {
    await loadExtensionEntry(entry)
    persistExtensions()
    return { success: true, extensions: serializeExtensions() }
  } catch (err) {
    entry.enabled = false
    entry.lastError = err.message
    persistExtensions()
    return { success: false, error: err.message, extensions: serializeExtensions() }
  }
})

ipc.handle('extensions:remove', async function (e, data = {}) {
  await extensionsReady

  const entry = findExtension(data.id, data.path)
  if (!entry) {
    return { success: false, error: 'Extension not found', extensions: serializeExtensions() }
  }

  await removeExtension(entry)
  return { success: true, extensions: serializeExtensions() }
})
