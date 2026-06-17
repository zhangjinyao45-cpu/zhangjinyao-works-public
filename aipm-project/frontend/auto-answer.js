window._ansCount = 0;
window._autoQ = setInterval(function() {
  var opts = document.querySelectorAll('button.option-btn');
  if (opts.length === 0) {
    opts = Array.from(document.querySelectorAll('button')).filter(function(b) {
      return b.textContent.length > 10 && !b.disabled
        && !b.textContent.includes('上一题')
        && !b.textContent.includes('下一题')
        && !b.textContent.includes('提交答案')
        && !b.textContent.includes('♪')
        && !b.textContent.includes('1×');
    });
  }
  if (opts.length > 0) opts[0].click();
  setTimeout(function() {
    var btns = Array.from(document.querySelectorAll('button'));
    var next = btns.find(function(b) { return b.textContent.includes('下一题') && !b.disabled; });
    if (!next) next = btns.find(function(b) { return b.textContent.includes('提交答案') && !b.disabled; });
    if (next) {
      next.click();
      window._ansCount++;
    }
    if (window._ansCount >= 19) {
      clearInterval(window._autoQ);
    }
  }, 1500);
}, 4000);
