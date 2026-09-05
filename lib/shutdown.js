async function shutdownWorkers() {
  if (typeof global.__khaChingCloseWorkers === "function") {
    await global.__khaChingCloseWorkers()
  }
}

module.exports = { shutdownWorkers }
