window._ansCount2 = 0;
window._autoQ2 = setInterval(function() {
  var opts = document.querySelectorAll('button.option-btn');
  if (opts.length === 0) {
    opts = Array.from(document.querySelectorAll('button')).filter(function(b) {
      return b.textContent.length > 10 && !b.disabled
        && !b.textContent.includes('上一题')
        && !b.textContent.includes('下一题')
        && !b.textContent.includes('提交答案')
        && !b.textContent.includes('确认并继续')
        && !b.textContent.includes('♪')
        && !b.textContent.includes('1×')
        && !b.textContent.includes('开始回答');
    });
  }
  if (opts.length > 0) opts[0].click();
  setTimeout(function() {
    var btns = Array.from(document.querySelectorAll('button'));
    var next = btns.find(function(b) { return b.textContent.includes('下一题') && !b.disabled; });
    if (!next) next = btns.find(function(b) { return b.textContent.includes('确认并继续') && !b.disabled; });
    if (!next) next = btns.find(function(b) { return b.textContent.includes('提交答案') && !b.disabled; });
    if (next) {
      next.click();
      window._ansCount2++;
    }
    if (window._ansCount2 >= 16) {
      clearInterval(window._autoQ2);
    }
  }, 1500);
}, 5000);
