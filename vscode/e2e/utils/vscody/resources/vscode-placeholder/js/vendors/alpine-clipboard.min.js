(function (factory) {
    typeof define === 'function' && define.amd ? define(factory) :
    factory();
}((function () { 'use strict';

    let onCopy = () => {};

    const copy = (target, mimeType = undefined) => {
      if (typeof target === 'function') {
        target = target();
      }

      if (typeof target === 'object') {
        target = JSON.stringify(target);
      }

      if (mimeType !== undefined) {
        return window.navigator.clipboard.write([new ClipboardItem({
          [mimeType]: new Blob([target], {
            type: mimeType
          })
        })]).then(onCopy);
      }

      return window.navigator.clipboard.writeText(target).then(onCopy);
    };

    function Clipboard(Alpine) {
      Alpine.magic('clipboard', () => {
        return copy;
      });
      Alpine.directive('clipboard', (el, {
        modifiers,
        expression
      }, {
        evaluateLater,
        cleanup
      }) => {
        const getCopyContent = modifiers.includes('raw') ? c => c(expression) : evaluateLater(expression);

        const clickHandler = () => getCopyContent(copy);

        el.addEventListener('click', clickHandler);
        cleanup(() => {
          el.removeEventListener('click', clickHandler);
        });
      });
    }

    Clipboard.configure = config => {
      if (config.hasOwnProperty('onCopy') && typeof config.onCopy === 'function') {
        onCopy = config.onCopy;
      }

      return Clipboard;
    };

    document.addEventListener('alpine:initializing', () => {
      Clipboard(window.Alpine);
    });

})));
//# sourceMappingURL=alpine-clipboard.js.map