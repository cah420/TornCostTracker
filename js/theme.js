window.TCT.theme = {
  current:'dark',
  init(){
    document.documentElement.dataset.theme=this.current;
  },
  set(theme){
    this.current=theme;
    document.documentElement.dataset.theme=theme;
  }
};
