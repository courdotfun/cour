// Ported VERBATIM from design/cour-v8.html fitStage() + its resize/scroll wiring.
// This is the v8 sizing mechanism: #stage is laid out at 1920px and uniformly
// scaled to the viewport on desktop (>820px); a static phone layout kicks in ≤820px.
// Replicated exactly so the app matches v8 pixel-for-pixel at every width.
/* eslint-disable */
// @ts-nocheck
export function initStage(): () => void {
  function fitStage(){
    var stage=document.getElementById('stage'); if(!stage) return;
    var nav=document.querySelector('.navbar');
    var mascot=document.querySelector('.mascot');
    if(window.innerWidth<=820){
      stage.style.position='static'; stage.style.width='100%';
      stage.style.transform='none'; stage.style.left='0';
      document.body.style.height='auto';
      var _np0=document.querySelector('.news-panel'),_sp0=document.getElementById('sidePanel'); if(_np0)_np0.style.height=''; if(_sp0)_sp0.style.height='';
      if(nav) nav.style.transform='translateX(-50%)';
        if(mascot){mascot.style.transform='';mascot.style.left='';mascot.style.bottom='';if((window.courOinkApply||window.eonOinkApply))eonOinkApply();}
      var _cp0=document.getElementById('csPanel'); if(_cp0){_cp0.style.transform='';_cp0.style.left='';_cp0.style.bottom='';}
      var _ts=document.querySelector('.toaster');
      if(_ts){_ts.style.transform='translateX(-50%)';_ts.style.left='50%';_ts.style.right='auto';_ts.style.top='8px';}
      return;
    }
    var base=1920, maxS=1;
    var s=window.innerWidth/base; if(s>maxS)s=maxS;
    var stageLeft=(window.innerWidth-base*s)/2;
    stage.style.position='absolute'; stage.style.width=base+'px';
    stage.style.transform='scale('+s+')';
    stage.style.left=stageLeft+'px';
    var _vh=window.innerHeight/s, _np=document.querySelector('.news-panel'), _sp=document.getElementById('sidePanel');
    var _pr=document.querySelector('#home.active .promos'), _top=90;
    if(_pr){ _top=Math.round((_pr.getBoundingClientRect().top-stage.getBoundingClientRect().top)/s); }
    else{ var _tg=document.querySelector('#token.active .tk-grid'); if(_tg){ _top=Math.round((_tg.getBoundingClientRect().top-stage.getBoundingClientRect().top)/s); } }
    var _ph=Math.max(620,Math.round(_vh-_top-22));
    if(_np){_np.style.top=_top+'px';_np.style.height=_ph+'px';}
    if(_sp)_sp.style.height=(_ph-78)+'px';
    document.body.style.height=(stage.offsetHeight*s)+'px';
    if(nav){nav.style.transformOrigin='bottom center';nav.style.transform='translateX(-50%) scale('+s+')';}
    if(mascot){
      mascot.style.transformOrigin='bottom left';
      var ms=Math.max(s*1.3,1.1);   // Oink stays big on laptops/PCs (not shrunk with the page)
      mascot.style.left=Math.max(10,stageLeft+18*s)+'px';
      mascot.style.bottom=(16*s)+'px';
      mascot.style.transform='scale('+ms+')';
    }
    var csp=document.getElementById('csPanel');
    if(csp){
      csp.style.transformOrigin='bottom left';
      csp.style.left=(stageLeft+18*s)+'px';
      csp.style.bottom=Math.round(16*s+112*Math.max(s*1.3,1.1)+14)+'px';
      csp.style.transform='scale('+s+')';
    }
    var toaster=document.querySelector('.toaster');
    if(toaster){
      if(window.innerWidth<=820){
        toaster.style.transformOrigin='top center';
        toaster.style.top='8px';
        toaster.style.left='50%';
        toaster.style.right='auto';
        toaster.style.transform='translateX(-50%)';
      } else {
        var _sb=document.querySelector('.search-top');
        var r=_sb?_sb.getBoundingClientRect():null;
        toaster.style.right='auto';
        toaster.style.transformOrigin='top center';
        toaster.style.top=Math.max(12,Math.round((r?r.bottom:64)+12*s))+'px';   // under the search bar, or tucked to the top once the bar has scrolled away
        toaster.style.left=(r?(r.left+r.width/2):window.innerWidth/2)+'px';
        toaster.style.transform='translateX(-50%) scale('+s+')';
      }
    }
  }
  (function(){ var q=0; window.addEventListener('scroll',function(){ if(q||window.innerWidth<=820) return; q=requestAnimationFrame(function(){ q=0; var t=document.querySelector('.toaster'), sb=document.querySelector('.search-top'); if(!t||!sb) return; var s=window.innerWidth/1920; if(s>1)s=1; t.style.top=Math.max(12,Math.round(sb.getBoundingClientRect().bottom+12*s))+'px'; }); },{passive:true}); })();
  window.addEventListener('resize',fitStage);
  window.addEventListener('load',fitStage);
  if(window.visualViewport){window.visualViewport.addEventListener('resize',fitStage);}
  const onScrollCleanup = () => {};
  return () => {
    window.removeEventListener("resize", fitStage);
    window.removeEventListener("load", fitStage);
    if (window.visualViewport) window.visualViewport.removeEventListener("resize", fitStage);
  };
}
