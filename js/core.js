window.TCT = {
  appName: "Torn Cost Tracker",
  version: "0.2.0",
  currentPage: "dashboard",

  async init() {
    await this.router.load("dashboard");
    document.getElementById("version").textContent = `Version ${this.version}`;
  }
};
