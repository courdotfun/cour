// Applies the saved theme before paint (no flash) and migrates the old eon-* keys
// to cour-*. Mirrors the v8 header bootstrap.
export function ThemeScript() {
  const js = `(function(){try{
    var k='cour-theme', old='eon-theme';
    var saved=localStorage.getItem(k);
    if(saved==null){var o=localStorage.getItem(old); if(o!=null){saved=o; localStorage.setItem(k,o);}}
    var ol=localStorage.getItem('eon-light'); if(ol!=null && localStorage.getItem('cour-light')==null) localStorage.setItem('cour-light',ol);
    var THEMES=['cartoon','light'];
    var t=THEMES.indexOf(saved)>=0?saved:'cartoon';
    var B=document.body;
    B.classList.toggle('theme-cartoon',t!=='classic');
    B.classList.toggle('theme-light',t==='light');
    if(t==='light')B.classList.add('l-pink');
    B.dataset.theme=t;
  }catch(e){document.body.dataset.theme='cartoon';document.body.classList.add('theme-cartoon');}})();`;
  return <script dangerouslySetInnerHTML={{ __html: js }} />;
}
