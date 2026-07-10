window.TCT = {
  appName: "Torn Cost Tracker",
  currentPage: "dashboard",

  async init() {
    await this.router.load("dashboard");
  }
};
