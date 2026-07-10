window.TCT.ui = {
  toast(msg){
    const c=document.getElementById('toastContainer');
    const t=document.createElement('div');
    t.className='toast';
    t.textContent=msg;
    c.appendChild(t);
    setTimeout(()=>t.remove(),3000);
  }
};
