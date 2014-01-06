/**
 The MIT License

 Copyright (c) 2010 Daniel Park (http://metaweb.com, http://postmessage.freebaseapps.com)
 Ender port and recent changes (c) 2012 Eugene Mirotin

 Permission is hereby granted, free of charge, to any person obtaining a copy
 of this software and associated documentation files (the "Software"), to deal
 in the Software without restriction, including without limitation the rights
 to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
 copies of the Software, and to permit persons to whom the Software is
 furnished to do so, subject to the following conditions:

 The above copyright notice and this permission notice shall be included in
 all copies or substantial portions of the Software.

 THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
 FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
 AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
 LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
 OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
 THE SOFTWARE.
 **/
 !function (name, context, definition) {
  if (typeof module != 'undefined' && module.exports) module.exports = definition();
  else if (typeof define == 'function' && define.amd) define(definition);
  else {
    var self = definition(),
      prev = context[name];
    self.noConflict = function () {
      context[name] = prev;
      return self;
    };
    context[name] = self;
  }
}('pm', this, function () {

  "use strict";

  var c = {},
    debugLevels = ['log', 'warn', 'error', 'debug'],
    DEBUG_LEVEL = 'error',
    i, l;
  if (!('console' in window)) {
    var noop = function () {};
    for (i = 0, l = debugLevels.length; i < l; i++) {
      c[debugLevels[i]] = noop;
    }
  } else {
    var shouldLog = function (level) {
      if (level == 'log') {
        // always allow normal logs
        return true;
      }
      if (DEBUG_LEVEL == 'debug') {
        // in debug mode log everything
        return true;
      }
      if (level != 'error' && DEBUG_LEVEL == 'error') {
        // in error mode only output errors (and logs handled above)
        return false;
      }
      return true;
    };
    var logWrap = function (level) {
      return function() {
        if (shouldLog(level)) {
          console[level].apply(console, arguments);
        }
      };
    };
    for (i = 0, l = debugLevels.length; i < l; i++) {
      c[debugLevels[i]] = logWrap(debugLevels[i]);
    }
  }

  if (typeof JSON !== 'object') {
    throw new Error('This browser does not have a JSON parser. You need to include json2.js');
  }

  /**
   * Array.indexOf
   * Taken From https://developer.mozilla.org/en/JavaScript/Reference/Global_Objects/Array/indexOf
   **/
  if (!Array.prototype.indexOf) {
    Array.prototype.indexOf = function (c) {
      if (this == null) {
        throw new TypeError();
      }
      var d = Object(this);
      var a = d.length >>> 0;
      if (a === 0) {
        return - 1;
      }
      var e = 0;
      if (arguments.length > 0) {
        e = Number(arguments[1]);
        if (e !== e) {
          e = 0;
        } else {
          if (e !== 0 && e !== Infinity && e !== -Infinity) {
            e = (e > 0 || -1) * Math.floor(Math.abs(e));
          }
        }
      }
      if (e >= a) {
        return - 1;
      }
      var b = e >= 0 ? e: Math.max(a - Math.abs(e), 0);
      for (; b < a; b++) {
        if (b in d && d[b] === c) {
          return b;
        }
      }
      return - 1;
    };
  }

  /*
   * extend based on Underscore.js
  */
  var extend = function(obj) {
    var source;
    for (var i = 1, l = arguments.length; i < l; i++) {
      source = arguments[i];
      if (source) {
        for (var prop in source) {
          obj[prop] = source[prop];
        }
      }
    }
    return obj;
  };

  var
    pm,
    PostMessage
  ;

  // send postmessage
  PostMessage = function (options) {
    pm.send(options);
  };

  // bind postmessage handler
  PostMessage.bind = function (type, fn, origin, hash, async_reply) {
    pm.bind(type, fn, origin, hash, async_reply === true);
  };

  // unbind postmessage handler
  PostMessage.unbind = function (type, fn) {
    pm.unbind(type, fn);
  };

  // default postmessage origin on bind
  PostMessage.origin = null;

  // default postmessage polling if using location hash to pass postmessages
  PostMessage.poll = 200;

  // allows changing debug level at runtime
  PostMessage.setDebugLevel = function (level) {
    if (debugLevels.indexOf(level) < 0) {
      return;
    }
    DEBUG_LEVEL = level;
  };

  pm = {

    send: function (options) {
      var
        o = extend({}, pm.defaults, options),
        target = o.target,
        msg = {
          data: o.data,
          type: o.type
        }
      ;
      if (!o.target) {
        c.warn('postmessage target window required');
        return;
      }
      if (!o.type) {
        c.warn('postmessage type required');
        return;
      }

      if (o.success) {
        msg.callback = pm._callback(o.success);
      }
      if (o.error) {
        msg.errback = pm._callback(o.error);
      }
      if (('postMessage' in target) && !o.hash) {
        pm._bind();
        target.postMessage(JSON.stringify(msg), o.origin || '*');
      } else {
        pm.hash._bind();
        pm.hash.send(o, msg);
      }
    },

    bind: function (type, fn, origin, hash, async_reply) {
      pm._replyBind(type, fn, origin, hash, async_reply);
    },

    _replyBind: function (type, fn, origin, hash, isCallback) {
      if (('postMessage' in window) && !hash) {
        pm._bind();
      }
      else {
        pm.hash._bind();
      }
      var l = pm.data('listeners.postmessage');
      if (!l) {
        l = {};
        pm.data('listeners.postmessage', l);
      }
      var fns = l[type];
      if (!fns) {
        fns = [];
        l[type] = fns;
      }
      fns.push({
        fn: fn,
        callback: isCallback,
        origin: origin || PostMessage.origin
      });
    },

    unbind: function (type, fn) {
      var listeners = pm.data('listeners.postmessage');
      if (!listeners) {
        return;
      }

      if (!type) {
        // unbind all listeners of all type
        for (var li in listeners) {
          delete listeners[li];
        }
        return;
      }

      if (fn) {
        // remove specific listener
        var
          fns = listeners[type],
          m = []
        ;
        if (fns) {
          for (var i = 0, len = fns.length; i < len; i++) {
            var o = fns[i];
            if (o.fn !== fn) {
              m.push(o);
            }
          }
          listeners[type] = m;
        }
      } else {
        // remove all listeners by type
        delete listeners[type];
      }
    },

    data: function (k, v) {
      if (v === undefined) {
        return pm._data[k];
      }
      pm._data[k] = v;
      return v;
    },

    _data: {},

    _CHARS: '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz'.split(''),

    _random: function () {
      var r = [];
      for (var i = 0; i < 32; i++) {
        r[i] = pm._CHARS[0 | Math.random() * 32];
      }
      return r.join('');
    },

    _callback: function (fn) {
      var cbs = pm.data('callbacks.postmessage');
      if (!cbs) {
        cbs = {};
        pm.data('callbacks.postmessage', cbs);
      }
      var r = pm._random();
      cbs[r] = fn;
      return r;
    },

    _bind: function () {
      // are we already listening to message events on this w?
      if (!pm.data('listening.postmessage')) {
        if (window.addEventListener) {
          window.addEventListener('message', pm._dispatch, false);
        } else if (window.attachEvent) {
          window.attachEvent('onmessage', pm._dispatch);
        }
        pm.data('listening.postmessage', 1);
      }
    },

    _dispatch: function (e) {
      var
        src = e.source,
        msg
      ;

      try {
        msg = JSON.parse(e.data);
      } catch (ex) {
        c.warn('postmessage data invalid json: ', ex);
        return;
      }
      if (!msg.type) {
        c.warn('postmessage message type required');
        return;
      }

      var
        cbs = pm.data('callbacks.postmessage') || {},
        cb = cbs[msg.type],
        listeners = pm.data('listeners.postmessage') || {},
        fns = listeners[msg.type] || []
      ;

      function sendReply(data) {
        if (msg.callback) {
          pm.send({
            target: src,
            data: data,
            type: msg.callback
          });
        }
      }

      function sendError(ex) {
        if (msg.errback) {
          pm.send({
            target: src,
            data: ex,
            type: msg.errback
          });
        }
      }

      if (cb) {
        cb(msg.data);
      } else {
        for (var i = 0, len = fns.length; i < len; i++) {
          var o = fns[i];

          if (o.origin && ((o.origin instanceof Array && o.origin.indexOf(e.origin) === -1) || ((typeof(o.origin) === 'string' || o.origin instanceof String) && o.origin !== '*' && e.origin !== o.origin)))
          {
            c.warn('postmessage message origin mismatch', e.origin, o.origin);
            if (msg.errback) {
              // notify post message errback
              var error = {
                message: 'postmessage origin mismatch',
                origin: [e.origin, o.origin]
              };
              pm.send({
                target: e.source,
                data: error,
                type: msg.errback
              });
            }
            continue;
          }

          try {
            if (o.callback) {
              o.fn(msg.data, sendReply, sendError, e);
            } else {
              sendReply(o.fn(msg.data, e));
            }
          } catch (err) {
            if (msg.errback) {
              sendError(err);
              // notify post message errback
              //pm.send({target:src, data:ex, type:msg.errback});
            } else {
              throw err;
            }
          }
        }
      }
    }
  };

  // location hash polling
  pm.hash = {

    send: function (options, msg) {
      //c.log("hash.send", target_window, options, msg);
      var
        target_window = options.target,
        target_url = options.url,
        source_window,
        source_url = pm.hash._url(window.location.href)
      ;

      if (!target_url) {
        c.warn('postmessage target window url is required');
        return;
      }

      target_url = pm.hash._url(target_url);

      if (window == target_window.parent) {
        source_window = 'parent';
      } else {
        try {
          for (var i = 0, len = parent.frames.length; i < len; i++) {
            var f = parent.frames[i];
            if (f == window) {
              source_window = i;
              break;
            }
          }
        } catch (ex) {
          // Opera: security error trying to access parent.frames x-origin
          // juse use window.name
          source_window = window.name;
        }
      }
      if (source_window == null) {
        c.warn('postmessage windows must be direct parent/child windows and the child must be available through the parent window.frames list');
        return;
      }
      var hashmessage = {
        'x-requested-with': 'postmessage',
        source: {
          name: source_window,
          url: source_url
        },
        postmessage: msg
      };
      var hash_id = '#x-postmessage-id=' + pm._random();
      target_window.location = target_url + hash_id + encodeURIComponent(JSON.stringify(hashmessage));
    },

    _regex: /^\#x\-postmessage\-id\=(\w{32})/,

    _regex_len: '#x-postmessage-id='.length + 32,

    _bind: function () {
      // are we already listening to message events on this w?
      if (!pm.data('polling.postmessage')) {
        setInterval(function () {
          var hash = '' + window.location.hash,
          m = pm.hash._regex.exec(hash);
          if (m) {
            var id = m[1];
            if (pm.hash._last !== id) {
              pm.hash._last = id;
              pm.hash._dispatch(hash.substring(pm.hash._regex_len));
            }
          }
        }, PostMessage.poll || 200);
        pm.data('polling.postmessage', 1);
      }
    },

    _dispatch: function (hash) {
      if (!hash) {
        return;
      }
      try {
        hash = JSON.parse(decodeURIComponent(hash));
        if (!(hash['x-requested-with'] === 'postmessage' &&
        hash.source && hash.source.name != null && hash.source.url && hash.postmessage)) {
          // ignore since hash could've come from somewhere else
          return;
        }
      } catch (ex) {
        // ignore since hash could've come from somewhere else
        return;
      }

      var
        source_window,
        msg = hash.postmessage,
        cbs = pm.data('callbacks.postmessage') || {},
        cb = cbs[msg.type]
      ;

      function sendReply(data) {
        if (msg.callback) {
          pm.send({
            target: source_window,
            data: data,
            type: msg.callback,
            hash: true,
            url: hash.source.url
          });
        }
      }

      function sendError(ex) {
        if (msg.errback) {
          pm.send({
            target: source_window,
            data: ex,
            type: msg.errback,
            hash: true,
            url: hash.source.url
          });
        }
      }

      if (cb) {
        cb(msg.data);
      } else {
        if (hash.source.name === 'parent') {
          source_window = window.parent;
        }
        else {
          source_window = window.frames[hash.source.name];
        }
        var l = pm.data('listeners.postmessage') || {};
        var fns = l[msg.type] || [];

        for (var i = 0, len = fns.length; i < len; i++) {
          var o = fns[i];

          if (o.origin) {
            var origin = /https?\:\/\/[^\/]*/.exec(hash.source.url)[0];
            if ((o.origin instanceof Array && o.origin.indexOf(origin) === -1) || ((typeof(o.origin) === 'string' || o.origin instanceof String) && o.origin !== '*' && origin !== o.origin)) {
              //if (o.origin !== '*' && origin !== o.origin) {
              c.warn('postmessage message origin mismatch', origin, o.origin);
              if (msg.errback) {
                // notify post message errback
                var error = {
                  message: 'postmessage origin mismatch',
                  origin: [origin, o.origin]
                };
                pm.send({
                  target: source_window,
                  data: error,
                  type: msg.errback,
                  hash: true,
                  url: hash.source.url
                });
              }
              continue;
            }
          }

          try {
            if (o.callback) {
              o.fn(msg.data, sendReply, sendError);
            } else {
              sendReply(o.fn(msg.data));
            }
          } catch (e) {
            if (msg.errback) {
              // notify post message errback
              //pm.send({target:source_window, data:ex, type:msg.errback, hash:true, url:hash.source.url});
              sendError(e);
            } else {
              throw e;
            }
          }
        }
      }
    },

    _url: function (url) {
      // url minus hash part
      return ('' + url).replace(/#.*$/, '');
    }

  };


  extend(pm, {
    defaults: {
      /* target window (required) */
      target: null,
      /* target window url (required if no window.postMessage or hash == true) */
      url: null,
      /* message type (required) */
      type: null,
      /* message data (required) */
      data: null,
      /* success callback (optional) */
      success: null,
      /* error callback (optional) */
      error: null,
      /* postmessage origin (optional) */
      origin: '*',
      /* use location hash for message passing (optional) */
      hash: false
    }
  });

  return PostMessage;
});