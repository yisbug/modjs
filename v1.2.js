var require, define;

(function (global) {
    if (require) return;
    var head = document.getElementsByTagName('head')[0],
        scriptsMap = {}, // 已加载的script url
        factoryMap = {}, // 已定义的模块
        resMap = {}, // 已配置的resourseMap
        pkgMap = {}, // pkg
        modulesMap = {}, // 已缓存的模块
        aliasMap = {}, //
        loadedMap = {}, // 正在加载的js
        fn = function () {},
        ignores = ['require', 'module', 'exports'],
        isDebug = false,
        indexOf = function(arr,item){
            for (var i = arr.length - 1; i >= 0; i--) {
                if(arr[i]===item) return i;
            };
            return -1;
        },
        // 根目录默认为当前js所在目录
        baseUrl = getRoot(document, document.scripts);
    if(isDebug){
        window['r'] = {
            modulesMap:modulesMap,
            aliasMap:aliasMap,
            factoryMap:factoryMap,
            scriptsMap:scriptsMap,
            resMap:resMap,
            pkgMap:pkgMap,
            loadedMap:loadedMap
        };
    }
    // 获取模块所在目录
    function getRoot(dom, jss) {
        var dom = jss ? jss : dom.getElementsByTagName('script');
        var _path = dom[dom.length - 1].src.substring(0, dom[dom.length - 1].src.lastIndexOf("/") + 1);
        var arr = _path.split('//');
        arr.shift();
        arr = arr.join('//').split('/');
        arr.shift();
        if (arr.length === 0 || arr[0] === '') return './';
        return arr.join('/');
    }

    // 相对路径
    // '/a/b/c','../d' return '/a/d'
    // /a/b/c    ./d  return a/b/d
    // /a/b/e/   ./d return a/b/e/d
    // /a/b/e/f/ ../d return a/b/e/d
    function relativePath(root, id) {
        var paths = root.split('/');
        var ids = id.split('/');
        if (paths[paths.length - 1]) paths.pop(); // 非/结尾的根目录，去掉文件名
        for (var i = 0, l = ids.length; i < l; i++) {
            if (ids[i] === '.') continue;
            if (ids[i] !== '..') {
                paths = paths.concat(ids.slice(i));
                break;
            }
            paths.pop();
        }
        return paths.join('/');
    }


    // 获取路径
    function createUrl(root, id) {
        var _path = relativePath(id, root);
        if (!/\.js$/i.test(_path)) return _path + '.js';
    }


    define = function (id, deps, factory) {
        isDebug && console.log('定义模块', id);
        if (!factory) { // 两个参数
            factory = deps;
            deps = null;
        }
        if (id && id.splice) { // 两个参数，并且没有指定模块id名。(用于处理ques)
            // TODO
            id = createUrl('', baseUrl);
            deps = id;
        }
        id = id.replace(/\.js$/i, '');
        if (deps && typeof deps === 'string') deps = [deps];
        factoryMap[id] = {
            factory: factory,
            deps: deps
        };
    };
    // 为了兼容agency/index/exercise的amd我也是拼了……
    define.amd = true;

    require = function (id) {
        // 多个，异步加载。
        isDebug && console.log('加载依赖:', id, arguments.length,arguments);
        if (id && id.splice) return require.async.apply(global, arguments);

        if(indexOf(ignores,id)!==-1) return require;

        id = require.alias(id);

        if (modulesMap[id]) return modulesMap[id].exports;

        var mod = modulesMap[id] = {
            exports: {}
        };

        var args = [function (name) {
            if (name[0] === '.') name = relativePath(id, name);
            arguments[0] = name;
            return require.apply(global, arguments);
        }, mod.exports, mod];
        var ignoresMap = {
            'require': args[0],
            'module': args[2],
            'exports': args[1]
        };

        if(ignoresMap[id]) return ignoresMap[id];

        var factoryConf = factoryMap[id];

        if (!factoryConf) {
            if (loadedMap[id]) {
                return isDebug && console.log('[ModJS] Cannot find module `' + id + '`');
            } else {
                isDebug && console.log('没有定义模块，异步加载：', id);
                return require.async(id);
            }
        }

        // 直接返回值
        if (typeof factoryConf.factory !== 'function') {
            mod.exports = factoryConf.factory;
            return mod.exports;
        }

        if (factoryConf.deps) {
            args = [];
            for (var i = 0, l = factoryConf.deps.length; i < l; i++) {
                var moduleId = factoryConf.deps[i];
                if (/^\.{1,2}\//.test(moduleId)) moduleId = relativePath(id, moduleId);
                args.push(ignoresMap[moduleId] ? ignoresMap[moduleId] : require(moduleId));
            }
        }

        isDebug && console.log('加载依赖完成：', id);
        mod.exports = factoryConf.factory.apply(global, args) || mod.exports || {};
        return mod.exports;
    };

    // 异步顺序加载Js
    require.async = function (names, onload, onerror) {
        isDebug && console.log('异步加载依赖', names);
        if (typeof names === 'string') names = [names];
        var namesCopy = names.concat([]);
        var _onload = function () {
            var args = [];
            for (var i = 0, l = namesCopy.length; i < l; i++) {
                isDebug && console.log('获取依赖', namesCopy[i]);
                args.push(require(namesCopy[i]));
            }
            isDebug && console.log('触发onload', names,111,args,2222,namesCopy);
            onload && onload.apply(global, args);
        };
        // 根据id获取url
        var _findUrl = function (id) {
            if (aliasMap[id]) return aliasMap[id];
            var res = resMap[id] || resMap[id + '.js'] || {},
                pkg = res.pkg;
            if (pkg) return pkgMap[pkg].url;
            return res.url || createUrl(id, baseUrl);
        };
        // 加载js
        var _loadJs = function (name) {
            var id = require.alias(name);
            var _url = _findUrl(id);
            loadedMap[id] = true;
            require.loadJs(_url, function () {
                _next();
            }, onerror);
        };
        // 下一个
        var _next = function () {

            if (names.length === 0) return _onload();
            var id = names.shift();
            isDebug && console.log('异步加载js', id, !!factoryMap[id]);
            if(indexOf(ignores,id)!==-1) return _next();
            if (factoryMap[id]) return _next();
            _loadJs(id);
        };

        _next();
    };
    // 加载css
    require.loadCss = function (url) {
        if (cfg.content) {
            var sty = document.createElement('style');
            sty.type = 'text/css';

            if (sty.styleSheet) { // IE
                sty.styleSheet.cssText = cfg.content;
            } else {
                sty.innerHTML = cfg.content;
            }
            head.appendChild(sty);
        } else if (cfg.url) {
            var link = document.createElement('link');
            link.href = cfg.url;
            link.rel = 'stylesheet';
            link.type = 'text/css';
            head.appendChild(link);
        }
    };
    // 单纯的加载js
    require.loadJs = function (url, onsuccess, onerror) {
        if (url in scriptsMap) return onsuccess ? onsuccess() : '';
        scriptsMap[url] = true;
        var script = document.createElement('script'),
            tid = null;
        // 清除定时器
        function clearTid() {
            if (tid === null) return false;
            if (tid) {
                clearTimeout(tid);
                tid = null;
            }
            return true;
        }
        if (onerror) {
            var _onerror = function () {
                clearTid() && onerror && onerror();
            };
            tid = setTimeout(_onerror, require.timeout);
            script.onerror = _onerror;
        } else {
            tid = false;
        }
        if (onsuccess) {
            var _onsuccess = function () {
                clearTid() && onsuccess && onsuccess();
            };
            if ('onload' in script) {
                script.onload = _onsuccess;
            } else {
                script.onreadystatechange = function () {
                    if (this.readyState === 'loaded' || this.readyState === 'complete') _onsuccess();
                }
            }
        }
        script.type = 'text/javascript';
        script.src = url;
        head.appendChild(script);
        isDebug && console.log('加载远程url',url);
        return script;
    };

    // 设置resourceMap
    require.resourceMap = function (obj) {
        var k, col;
        // merge `res` & `pkg` fields
        col = obj.res;
        for (k in col) {
            if (col.hasOwnProperty(k)) {
                resMap[k] = col[k];
            }
        }

        col = obj.pkg;
        for (k in col) {
            if (col.hasOwnProperty(k)) {
                pkgMap[k] = col[k];
            }
        }
    };

    // 去掉.js后缀
    require.alias = function (id) {
        return id.replace(/\.js$/i, '');
    };


    require.timeout = 5000;
})(this);


define('badjs', function () {
    //==== module code begin ====
    var global = window;
    var badjs = function (msg, url, line, msid, level) {
        var ext = {};
        if (msid) {
            ext.msid = msid;
        }
        BJ_REPORT.report({msg: msg, ext: ext, level: level || 4});
    };
    /*!
     * @module report
     * @author kael, chriscai
     * @date @DATE
     * Copyright (c) 2014 kael, chriscai
     * Licensed under the MIT license.
     */
    var BJ_REPORT = (function (global) {
        if (global.BJ_REPORT) return global.BJ_REPORT;

        var _error = [];
        var _config = {
            id: 0,
            uin: 0,
            url: "",
            combo: 1,
            ext: {},
            level: 4, // 1-debug 2-info 4-error 8-fail
            ignore: [],
            random: 1,
            delay: 1000,
            submit: null
        };

        var _isOBJByType = function (o, type) {
            return Object.prototype.toString.call(o) === "[object " + (type || "Object") + "]";
        };

        var _isOBJ = function (obj) {
            var type = typeof obj;
            return type === "object" && !!obj;
        };

        var orgError = global.onerror;
        // rewrite window.oerror
        global.onerror = function (msg, url, line, col, error) {
            var newMsg = msg;

            if (error && error.stack) {
                newMsg = _processStackMsg(error);
            }

            if (_isOBJByType(newMsg, "Event")) {
                newMsg += newMsg.type ? ("--" + newMsg.type + "--" + (newMsg.target ? (newMsg.target.tagName + "::" + newMsg.target.src) : "")) : "";
            }

            report.push({
                msg: newMsg,
                target: url,
                rowNum: line,
                colNum: col
            });

            _send();
            orgError && orgError.apply(global, arguments);
        };

        var _processError = function (errObj) {
            try {
                if (errObj.stack) {
                    var url = errObj.stack.match("http://[^\n]+");
                    url = url ? url[0] : "";
                    var rowCols = url.match(":([0-9]+):([0-9]+)");
                    if (!rowCols) {
                        rowCols = [0, 0, 0];
                    }

                    var stack = _processStackMsg(errObj);
                    return {
                        msg: stack,
                        rowNum: rowCols[1],
                        colNum: rowCols[2],
                        target: url.replace(rowCols[0], "")
                    };
                } else {
                    return errObj;
                }
            } catch (err) {
                return errObj;
            }
        };

        var _processStackMsg = function (error) {
            var stack = error.stack.replace(/\n/gi, "").split(/\bat\b/).slice(0, 5).join("@").replace(/\?[^:]+/gi, "");
            var msg = error.toString();
            if (stack.indexOf(msg) < 0) {
                stack = msg + "@" + stack;
            }
            return stack;
        };

        var _error_tostring = function (error, index) {
            var param = [];
            var params = [];
            var stringify = [];
            if (_isOBJ(error)) {
                error.level = error.level || _config.level;
                for (var key in error) {
                    var value = error[key] || "";
                    if (value) {
                        if (_isOBJ(value)) {
                            try {
                                value = JSON.stringify(value);
                            } catch (err) {
                                value = "[BJ_REPORT detect value stringify error] " + err.toString();
                            }
                        }
                        stringify.push(key + ":" + value);
                        param.push(key + "=" + encodeURIComponent(value));
                        params.push(key + "[" + index + "]=" + encodeURIComponent(value));
                    }
                }
            }

            // msg[0]=msg&target[0]=target -- combo report
            // msg:msg,target:target -- ignore
            // msg=msg&target=target -- report with out combo
            return [params.join("&"), stringify.join(","), param.join("&")];
        };

        var _imgs = [];
        var _submit = function (url) {
            if (_config.submit) {
                _config.submit(url);
            } else {
                if(window['__DIST_MODE__'] === 'dist'){
                    var _img = new Image();
                    _imgs.push(_img);
                    _img.src = url;
                };
            }
        };

        var error_list = [];
        var comboTimeout = 0;
        var _send = function (isReoprtNow) {
            if (!_config.report) return;

            while (_error.length) {
                var isIgnore = false;
                var error = _error.shift();
                var error_str = _error_tostring(error, error_list.length);
                if (_isOBJByType(_config.ignore, "Array")) {
                    for (var i = 0, l = _config.ignore.length; i < l; i++) {
                        var rule = _config.ignore[i];
                        if ((_isOBJByType(rule, "RegExp") && rule.test(error_str[1])) ||
                            (_isOBJByType(rule, "Function") && rule(error, error_str[1]))) {
                            isIgnore = true;
                            break;
                        }
                    }
                }
                if (!isIgnore) {
                    if (_config.combo) {
                        error_list.push(error_str[0]);
                    } else {
                        _submit(_config.report + error_str[2] + "&_t=" + (+new Date));
                    }
                    _config.onReport && (_config.onReport(_config.id, error));
                }
            }

            // 合并上报
            var count = error_list.length;
            if (count) {
                var comboReport = function () {
                    clearTimeout(comboTimeout);
                    _submit(_config.report + error_list.join("&") + "&count=" + count + "&_t=" + (+new Date));
                    comboTimeout = 0;
                    error_list = [];
                };

                if (isReoprtNow) {
                    comboReport(); // 立即上报
                } else if (!comboTimeout) {
                    comboTimeout = setTimeout(comboReport, _config.delay); // 延迟上报
                }
            }
        };

        var report = {
            push: function (msg) { // 将错误推到缓存池
                if (Math.random() >= _config.random) {
                    return report;
                }
                _error.push(_isOBJ(msg) ? _processError(msg) : {
                    msg: msg
                });
                _send();
                return report;
            },
            report: function (msg) { // error report
                msg && report.push(msg);
                _send(true);
                return report;
            },
            info: function (msg) { // info report
                if (!msg) {
                    return report;
                }
                if (_isOBJ(msg)) {
                    msg.level = 2;
                } else {
                    msg = {
                        msg: msg,
                        level: 2
                    };
                }
                report.push(msg);
                return report;
            },
            debug: function (msg) { // debug report
                if (!msg) {
                    return report;
                }
                if (_isOBJ(msg)) {
                    msg.level = 1;
                } else {
                    msg = {
                        msg: msg,
                        level: 1
                    };
                }
                report.push(msg);
                return report;
            },
            init: function (config) { // 初始化
                if (_isOBJ(config)) {
                    for (var key in config) {
                        _config[key] = config[key];
                    }
                }
                // 没有设置id将不上报
                var id = parseInt(_config.id, 10);
                if (id) {
                    _config.report = (_config.url || "http://badjs2.qq.com/badjs") + "?id=" + id + "&uin=" + parseInt(_config.uin || (document.cookie.match(/\buin=\D+(\d+)/) || [])[1], 10) + "&from=" + encodeURIComponent(location.href) + "&ext=" + JSON.stringify(_config.ext) + "&";
                }
                return report;
            },

            __onerror__: global.onerror
        };

        return report;

    }(window));



    global.BJ_REPORT = BJ_REPORT;
    global.Badjs = badjs;


    if (typeof exports !== 'undefined') {
        if (typeof module !== 'undefined' && module.exports) {
            exports = module.exports = BJ_REPORT;
        }
        exports.BJ_REPORT = BJ_REPORT;
    };
    (function (root) {

        if (!root.BJ_REPORT) {
            return;
        }

        var _onthrow = function (errObj) {
            try {
                if (errObj.stack) {
                    var url = errObj.stack.match('http://[^\n]+')[0];
                    var rowCols = url.match(':([0-9]+):([0-9]+)');
                    var msg = errObj.stack.replace(/\n/gi, '@').replace(/at[\s]/gi, '');

                    //badjs调试逻辑
                    // badjs.apply(this, [msg, url, rowCols, -1, null]);

                    root.BJ_REPORT.report({
                        msg: msg,
                        rowNum: rowCols[1],
                        colNum: rowCols[2],
                        target: url.replace(rowCols[0], '')
                    });
                } else {
                    root.BJ_REPORT.report(errObj);
                }
            } catch (err) {
                root.BJ_REPORT.report(err);
            }

        };

        var tryJs = root.BJ_REPORT.tryJs = function init(throwCb) {
            throwCb && (_onthrow = throwCb);


            return tryJs;
        };


        // merge
        var _merge = function (org, obj) {
            var key;
            for (key in obj) {
                org[key] = obj[key];
            }
        };

        // function or not
        var _isFunction = function (foo) {
            return typeof foo === 'function';
        };

        var cat = function (foo, args) {
            return function () {
                try {
                    return foo.apply(this, args || arguments);
                } catch (err) {
                    _onthrow(err);
                    // throw error to parent , hang-up context
                    console && console.log && console.log(["BJ-REPORT"], err.stack);
                    //throw new Error("badjs hang-up env");
                    // throw err;
                }
            };
        };

        var catArgs = function (foo) {
            return function () {
                var arg, args = [];
                for (var i = 0, l = arguments.length; i < l; i++) {
                    arg = arguments[i];
                    _isFunction(arg) && (arg = cat(arg));
                    args.push(arg);
                }
                return foo.apply(this, args);
            };
        };

        var catTimeout = function (foo) {
            return function (cb, timeout) {
                // for setTimeout(string, delay)
                if (typeof cb === 'string') {
                    try {
                        cb = new Function(cb);
                    } catch (err) {
                        throw err;
                    }
                }
                var args = [].slice.call(arguments, 2);
                // for setTimeout(function, delay, param1, ...)
                cb = cat(cb, args.length && args);
                return foo(cb, timeout);
            };
        };


        /**
         * makeArgsTry
         * wrap a function's arguments with try & catch
         * @param {Function} foo
         * @param {Object} self
         * @returns {Function}
         */
        var makeArgsTry = function (foo, self) {
            return function () {
                var arg, tmp, args = [];
                for (var i = 0, l = arguments.length; i < l; i++) {
                    arg = arguments[i];
                    _isFunction(arg) && (tmp = cat(arg)) &&
                        (arg.tryWrap = tmp) && (arg = tmp);
                    args.push(arg);
                }
                return foo.apply(self || this, args);
            };
        };

        /**
         * makeObjTry
         * wrap a object's all value with try & catch
         * @param {Function} foo
         * @param {Object} self
         * @returns {Function}
         */
        var makeObjTry = function (obj) {
            var key, value;
            for (key in obj) {
                value = obj[key];
                if (_isFunction(value)) obj[key] = cat(value);
            }
            return obj;
        };

        /**
         * wrap jquery async function ,exp : event.add , event.remove , ajax
         * @returns {Function}
         */
        tryJs.spyJquery = function () {
            var _$ = root.$;

            if (!_$ || !_$.event) {
                return tryJs;
            }

            var _add = _$.event.add,
                _ajax = _$.ajax,
                _remove = _$.event.remove;

            if (_add) {
                _$.event.add = makeArgsTry(_add);
                _$.event.remove = function () {
                    var arg, args = [];
                    for (var i = 0, l = arguments.length; i < l; i++) {
                        arg = arguments[i];
                        _isFunction(arg) && (arg = arg.tryWrap);
                        args.push(arg);
                    }
                    return _remove.apply(this, args);
                };
            }

            if (_ajax) {
                _$.ajax = function (url, setting) {
                    if (!setting) {
                        setting = url;
                        url = undefined;
                    }
                    makeObjTry(setting);
                    if (url) return _ajax.call(_$, url, setting);
                    return _ajax.call(_$, setting);
                };
            }

            return tryJs;
        };


        /**
         * wrap amd or commonjs of function  ,exp :  define , require ,
         * @returns {Function}
         */
        tryJs.spyModules = function () {
            var _require = root.require,
                _define = root.define;
            if (_require && _define) {
                root.require = catArgs(_require);
                _merge(root.require, _require);
                root.define = catArgs(_define);
                _merge(root.define, _define);
            }
            return tryJs;
        };

        /**
         * wrap async of function in window , exp : setTimeout , setInterval
         * @returns {Function}
         */
        tryJs.spySystem = function () {
            root.setTimeout = catTimeout(root.setTimeout);
            root.setInterval = catTimeout(root.setInterval);
            return tryJs;
        };


        /**
         * wrap custom of function ,
         * @param obj - obj or  function
         * @returns {Function}
         */
        tryJs.spyCustom = function (obj) {
            if (_isFunction(obj)) {
                return cat(obj);
            } else {
                return makeObjTry(obj);
            }
        };

        /**
         * run spyJquery() and spyModules() and spySystem()
         * @returns {Function}
         */
        tryJs.spyAll = function () {
            tryJs.spyJquery().spyModules().spySystem();
            return tryJs;
        };



        // if notSupport err.stack , return default function
        try {
            throw new Error("testError");
        } catch (err) {
            if (!err.stack) {
                for (var key in tryJs) {
                    if (_isFunction(tryJs[key])) {
                        tryJs[key] = function () {
                            return tryJs;
                        };
                    }
                }
            }
        }

    }(window));
    return badjs;
});


define('jquery', function () {

    (function (q, k) {
        function qa(a) {
            var b = a.length,
                d = c.type(a);
            return c.isWindow(a) ? false : 1 === a.nodeType && b ? true : "array" === d || "function" !== d && (0 === b || "number" == typeof b && b > 0 && b - 1 in a)
        }

        function Qb(a) {
            var b = Qa[a] = {};
            return c.each(a.match(F) || [], function (a, c) {
                b[c] = true
            }), b
        }

        function Ra(a, b, d, e) {
            if (c.acceptData(a)) {
                var f, g, h = c.expando,
                    i = "string" == typeof b,
                    j = a.nodeType,
                    o = j ? c.cache : a,
                    l = j ? a[h] : a[h] && h;
                if (l && o[l] && (e || o[l].data) || !i || d !== k) return l || (j ? a[h] = l = U.pop() || c.guid++ : l = h), o[l] || (o[l] = {}, j || (o[l].toJSON =
                    c.noop)), ("object" == typeof b || "function" == typeof b) && (e ? o[l] = c.extend(o[l], b) : o[l].data = c.extend(o[l].data, b)), f = o[l], e || (f.data || (f.data = {}), f = f.data), d !== k && (f[c.camelCase(b)] = d), i ? (g = f[b], null == g && (g = f[c.camelCase(b)])) : g = f, g
            }
        }

        function Sa(a, b, d) {
            if (c.acceptData(a)) {
                var e, f, g, h = a.nodeType,
                    i = h ? c.cache : a,
                    j = h ? a[c.expando] : c.expando;
                if (i[j]) {
                    if (b && (g = d ? i[j] : i[j].data)) {
                        c.isArray(b) ? b = b.concat(c.map(b, c.camelCase)) : b in g ? b = [b] : (b = c.camelCase(b), b = b in g ? [b] : b.split(" "));
                        for (e = 0, f = b.length; f > e; e++) delete g[b[e]];
                        if (!(d ? ra : c.isEmptyObject)(g)) return
                    }(d || (delete i[j].data, ra(i[j]))) && (h ? c.cleanData([a], true) : c.support.deleteExpando || i != i.window ? delete i[j] : i[j] = null)
                }
            }
        }

        function Ta(a, b, d) {
            if (d === k && 1 === a.nodeType) {
                var e = "data-" + b.replace(Rb, "-$1").toLowerCase();
                if (d = a.getAttribute(e), "string" == typeof d) {
                    try {
                        d = "true" === d ? true : "false" === d ? false : "null" === d ? null : +d + "" === d ? +d : Sb.test(d) ? c.parseJSON(d) : d
                    } catch (f) {}
                    c.data(a, b, d)
                } else d = k
            }
            return d
        }

        function ra(a) {
            for (var b in a)
                if (("data" !== b || !c.isEmptyObject(a[b])) &&
                    "toJSON" !== b) return false;
            return true
        }

        function ha() {
            return true
        }

        function aa() {
            return false
        }

        function Ua(a, b) {
            do a = a[b]; while (a && 1 !== a.nodeType);
            return a
        }

        function Va(a, b, d) {
            if (b = b || 0, c.isFunction(b)) return c.grep(a, function (a, c) {
                return !!b.call(a, c, a) === d
            });
            if (b.nodeType) return c.grep(a, function (a) {
                return a === b === d
            });
            if ("string" == typeof b) {
                var e = c.grep(a, function (a) {
                    return 1 === a.nodeType
                });
                if (Tb.test(b)) return c.filter(b, e, !d);
                b = c.filter(b, e)
            }
            return c.grep(a, function (a) {
                return c.inArray(a, b) >= 0 === d
            })
        }

        function Wa(a) {
            var b = Xa.split("|"),
                a = a.createDocumentFragment();
            if (a.createElement)
                for (; b.length;) a.createElement(b.pop());
            return a
        }

        function Ya(a) {
            var b = a.getAttributeNode("type");
            return a.type = (b && b.specified) + "/" + a.type, a
        }

        function Za(a) {
            var b = Ub.exec(a.type);
            return b ? a.type = b[1] : a.removeAttribute("type"), a
        }

        function sa(a, b) {
            for (var d, e = 0; null != (d = a[e]); e++) c._data(d, "globalEval", !b || c._data(b[e], "globalEval"))
        }

        function $a(a, b) {
            if (1 === b.nodeType && c.hasData(a)) {
                var d, e, f;
                e = c._data(a);
                var g = c._data(b,
                        e),
                    h = e.events;
                if (h)
                    for (d in delete g.handle, g.events = {}, h)
                        for (e = 0, f = h[d].length; f > e; e++) c.event.add(b, d, h[d][e]);
                g.data && (g.data = c.extend({}, g.data))
            }
        }

        function C(a, b) {
            var d, e, f = 0,
                g = typeof a.getElementsByTagName !== w ? a.getElementsByTagName(b || "*") : typeof a.querySelectorAll !== w ? a.querySelectorAll(b || "*") : k;
            if (!g)
                for (g = [], d = a.childNodes || a; null != (e = d[f]); f++) !b || c.nodeName(e, b) ? g.push(e) : c.merge(g, C(e, b));
            return b === k || b && c.nodeName(a, b) ? c.merge([a], g) : g
        }

        function Vb(a) {
            va.test(a.type) && (a.defaultChecked =
                a.checked)
        }

        function ab(a, b) {
            if (b in a) return b;
            for (var c = b.charAt(0).toUpperCase() + b.slice(1), e = b, f = bb.length; f--;)
                if (b = bb[f] + c, b in a) return b;
            return e
        }

        function V(a, b) {
            return a = b || a, "none" === c.css(a, "display") || !c.contains(a.ownerDocument, a)
        }

        function cb(a, b) {
            for (var d, e, f, g = [], h = 0, i = a.length; i > h; h++) e = a[h], e.style && (g[h] = c._data(e, "olddisplay"), d = e.style.display, b ? (g[h] || "none" !== d || (e.style.display = ""), "" === e.style.display && V(e) && (g[h] = c._data(e, "olddisplay", db(e.nodeName)))) : g[h] || (f = V(e), (d &&
                "none" !== d || !f) && c._data(e, "olddisplay", f ? d : c.css(e, "display"))));
            for (h = 0; i > h; h++) e = a[h], e.style && (b && "none" !== e.style.display && "" !== e.style.display || (e.style.display = b ? g[h] || "" : "none"));
            return a
        }

        function eb(a, b, c) {
            return (a = Wb.exec(b)) ? Math.max(0, a[1] - (c || 0)) + (a[2] || "px") : b
        }

        function fb(a, b, d, e, f) {
            for (var b = d === (e ? "border" : "content") ? 4 : "width" === b ? 1 : 0, g = 0; 4 > b; b += 2) "margin" === d && (g += c.css(a, d + O[b], true, f)), e ? ("content" === d && (g -= c.css(a, "padding" + O[b], true, f)), "margin" !== d && (g -= c.css(a, "border" + O[b] +
                "Width", true, f))) : (g += c.css(a, "padding" + O[b], true, f), "padding" !== d && (g += c.css(a, "border" + O[b] + "Width", true, f)));
            return g
        }

        function gb(a, b, d) {
            var e = true,
                f = "width" === b ? a.offsetWidth : a.offsetHeight,
                g = y(a),
                h = c.support.boxSizing && "border-box" === c.css(a, "boxSizing", false, g);
            if (0 >= f || null == f) {
                if (f = W(a, b, g), (0 > f || null == f) && (f = a.style[b]), ia.test(f)) return f;
                e = h && (c.support.boxSizingReliable || f === a.style[b]);
                f = parseFloat(f) || 0
            }
            return f + fb(a, b, d || (h ? "border" : "content"), e, g) + "px"
        }

        function db(a) {
            var b = m,
                d = hb[a];
            return d || (d = ib(a, b), "none" !== d && d || (P = (P || c("<iframe frameborder='0' width='0' height='0'/>").css("cssText", "display:block !important")).appendTo(b.documentElement), b = (P[0].contentWindow || P[0].contentDocument).document, b.write("<!doctype html><html><body>"), b.close(), d = ib(a, b), P.detach()), hb[a] = d), d
        }

        function ib(a, b) {
            var d = c(b.createElement(a)).appendTo(b.body),
                e = c.css(d[0], "display");
            return d.remove(), e
        }

        function wa(a, b, d, e) {
            var f;
            if (c.isArray(b)) c.each(b, function (b, c) {
                d || Xb.test(a) ? e(a, c) : wa(a + "[" +
                    ("object" == typeof c ? b : "") + "]", c, d, e)
            });
            else if (d || "object" !== c.type(b)) e(a, b);
            else
                for (f in b) wa(a + "[" + f + "]", b[f], d, e)
        }

        function jb(a) {
            return function (b, d) {
                "string" != typeof b && (d = b, b = "*");
                var e, f = 0,
                    g = b.toLowerCase().match(F) || [];
                if (c.isFunction(d))
                    for (; e = g[f++];) "+" === e[0] ? (e = e.slice(1) || "*", (a[e] = a[e] || []).unshift(d)) : (a[e] = a[e] || []).push(d)
            }
        }

        function kb(a, b, d, e) {
            function f(i) {
                var j;
                return g[i] = true, c.each(a[i] || [], function (a, c) {
                    var i = c(b, d, e);
                    return "string" != typeof i || h || g[i] ? h ? !(j = i) : k : (b.dataTypes.unshift(i),
                        f(i), false)
                }), j
            }
            var g = {},
                h = a === xa;
            return f(b.dataTypes[0]) || !g["*"] && f("*")
        }

        function ya(a, b) {
            var d, e, f = c.ajaxSettings.flatOptions || {};
            for (e in b) b[e] !== k && ((f[e] ? a : d || (d = {}))[e] = b[e]);
            return d && c.extend(true, a, d), a
        }

        function lb() {
            try {
                return new q.XMLHttpRequest
            } catch (a) {}
        }

        function mb() {
            return setTimeout(function () {
                L = k
            }), L = c.now()
        }

        function Yb(a, b) {
            c.each(b, function (b, c) {
                for (var f = (ea[b] || []).concat(ea["*"]), g = 0, h = f.length; h > g; g++)
                    if (f[g].call(a, b, c)) break
            })
        }

        function nb(a, b, d) {
            var e, f = 0,
                g = X.length,
                h =
                c.Deferred().always(function () {
                    delete i.elem
                }),
                i = function () {
                    if (e) return false;
                    for (var b = L || mb(), b = Math.max(0, j.startTime + j.duration - b), c = 1 - (b / j.duration || 0), d = 0, f = j.tweens.length; f > d; d++) j.tweens[d].run(c);
                    return h.notifyWith(a, [j, c, b]), 1 > c && f ? b : (h.resolveWith(a, [j]), false)
                },
                j = h.promise({
                    elem: a,
                    props: c.extend({}, b),
                    opts: c.extend(true, {
                        specialEasing: {}
                    }, d),
                    originalProperties: b,
                    originalOptions: d,
                    startTime: L || mb(),
                    duration: d.duration,
                    tweens: [],
                    createTween: function (b, d) {
                        var e = c.Tween(a, j.opts, b, d, j.opts.specialEasing[b] ||
                            j.opts.easing);
                        return j.tweens.push(e), e
                    },
                    stop: function (b) {
                        var c = 0,
                            d = b ? j.tweens.length : 0;
                        if (e) return this;
                        for (e = true; d > c; c++) j.tweens[c].run(1);
                        return b ? h.resolveWith(a, [j, b]) : h.rejectWith(a, [j, b]), this
                    }
                }),
                d = j.props;
            for (Zb(d, j.opts.specialEasing); g > f; f++)
                if (b = X[f].call(j, a, d, j.opts)) return b;
            return Yb(j, d), c.isFunction(j.opts.start) && j.opts.start.call(a, j), c.fx.timer(c.extend(i, {
                elem: a,
                anim: j,
                queue: j.opts.queue
            })), j.progress(j.opts.progress).done(j.opts.done, j.opts.complete).fail(j.opts.fail).always(j.opts.always)
        }

        function Zb(a, b) {
            var i;
            var d, e, f, g, h;
            for (f in a)
                if (e = c.camelCase(f), g = b[e], d = a[f], c.isArray(d) && (g = d[1], i = a[f] = d[0], d = i), f !== e && (a[e] = d, delete a[f]), h = c.cssHooks[e], h && "expand" in h)
                    for (f in d = h.expand(d), delete a[e], d) f in a || (a[f] = d[f], b[f] = g);
                else b[e] = g
        }

        function v(a, b, c, e, f) {
            return new v.prototype.init(a, b, c, e, f)
        }

        function ba(a, b) {
            for (var c, e = {
                    height: a
                }, f = 0, b = b ? 1 : 0; 4 > f; f += 2 - b) c = O[f], e["margin" + c] = e["padding" + c] = a;
            return b && (e.opacity = e.width = a), e
        }

        function ob(a) {
            return c.isWindow(a) ? a : 9 === a.nodeType ?
                a.defaultView || a.parentWindow : false
        }
        var ja, pb, w = typeof k,
            m = q.document,
            $b = q.location,
            ac = q.jQuery,
            bc = q.$,
            ka = {},
            U = [],
            qb = U.concat,
            za = U.push,
            Q = U.slice,
            rb = U.indexOf,
            cc = ka.toString,
            fa = ka.hasOwnProperty,
            Aa = "1.9.1".trim,
            c = function (a, b) {
                return new c.fn.init(a, b, pb)
            },
            la = /[+-]?(?:\d*\.|)\d+(?:[eE][+-]?\d+|)/.source,
            F = /\S+/g,
            dc = /^[\s\uFEFF\xA0]+|[\s\uFEFF\xA0]+$/g,
            ec = /^(?:(<[\w\W]+>)[^>]*|#([\w-]*))$/,
            sb = /^<(\w+)\s*\/?>(?:<\/\1>|)$/,
            fc = /^[\],:{}\s]*$/,
            gc = /(?:^|:|,)(?:\s*\[)+/g,
            hc = /\\(?:["\\\/bfnrt]|u[\da-fA-F]{4})/g,
            ic = /"[^"\\\r\n]*"|true|false|null|-?(?:\d+\.|)\d+(?:[eE][+-]?\d+|)/g,
            jc = /^-ms-/,
            kc = /-([\da-z])/gi,
            lc = function (a, b) {
                return b.toUpperCase()
            },
            M = function (a) {
                (m.addEventListener || "load" === a.type || "complete" === m.readyState) && (tb(), c.ready())
            },
            tb = function () {
                m.addEventListener ? (m.removeEventListener("DOMContentLoaded", M, false), q.removeEventListener("load", M, false)) : (m.detachEvent("onreadystatechange", M), q.detachEvent("onload", M))
            };
        c.fn = c.prototype = {
            jquery: "1.9.1",
            constructor: c,
            init: function (a, b, d) {
                var e,
                    f;
                if (!a) return this;
                if ("string" == typeof a) {
                    if (e = "<" === a.charAt(0) && ">" === a.charAt(a.length - 1) && a.length >= 3 ? [null, a, null] : ec.exec(a), !e || !e[1] && b) return !b || b.jquery ? (b || d).find(a) : this.constructor(b).find(a);
                    if (e[1]) {
                        if (b = b instanceof c ? b[0] : b, c.merge(this, c.parseHTML(e[1], b && b.nodeType ? b.ownerDocument || b : m, true)), sb.test(e[1]) && c.isPlainObject(b))
                            for (e in b) c.isFunction(this[e]) ? this[e](b[e]) : this.attr(e, b[e]);
                        return this
                    }
                    if (f = m.getElementById(e[2]), f && f.parentNode) {
                        if (f.id !== e[2]) return d.find(a);
                        this.length = 1;
                        this[0] = f
                    }
                    return this.context = m, this.selector = a, this
                }
                return a.nodeType ? (this.context = this[0] = a, this.length = 1, this) : c.isFunction(a) ? d.ready(a) : (a.selector !== k && (this.selector = a.selector, this.context = a.context), c.makeArray(a, this))
            },
            selector: "",
            length: 0,
            size: function () {
                return this.length
            },
            toArray: function () {
                return Q.call(this)
            },
            get: function (a) {
                return null == a ? this.toArray() : 0 > a ? this[this.length + a] : this[a]
            },
            pushStack: function (a) {
                a = c.merge(this.constructor(), a);
                return a.prevObject = this, a.context =
                    this.context, a
            },
            each: function (a, b) {
                return c.each(this, a, b)
            },
            ready: function (a) {
                return c.ready.promise().done(a), this
            },
            slice: function () {
                return this.pushStack(Q.apply(this, arguments))
            },
            first: function () {
                return this.eq(0)
            },
            last: function () {
                return this.eq(-1)
            },
            eq: function (a) {
                var b = this.length,
                    a = +a + (0 > a ? b : 0);
                return this.pushStack(a >= 0 && b > a ? [this[a]] : [])
            },
            map: function (a) {
                return this.pushStack(c.map(this, function (b, c) {
                    return a.call(b, c, b)
                }))
            },
            end: function () {
                return this.prevObject || this.constructor(null)
            },
            push: za,
            sort: [].sort,
            splice: [].splice
        };
        c.fn.init.prototype = c.fn;
        c.extend = c.fn.extend = function () {
            var a, b, d, e, f, g, h = arguments[0] || {},
                i = 1,
                j = arguments.length,
                o = false;
            for ("boolean" == typeof h && (o = h, h = arguments[1] || {}, i = 2), "object" == typeof h || c.isFunction(h) || (h = {}), j === i && (h = this, --i); j > i; i++)
                if (null != (f = arguments[i]))
                    for (e in f) a = h[e], d = f[e], h !== d && (o && d && (c.isPlainObject(d) || (b = c.isArray(d))) ? (b ? (b = false, g = a && c.isArray(a) ? a : []) : g = a && c.isPlainObject(a) ? a : {}, h[e] = c.extend(o, g, d)) : d !== k && (h[e] = d));
            return h
        };
        c.extend({
            noConflict: function (a) {
                return q.$ ===
                    c && (q.$ = bc), a && q.jQuery === c && (q.jQuery = ac), c
            },
            isReady: false,
            readyWait: 1,
            holdReady: function (a) {
                a ? c.readyWait++ : c.ready(true)
            },
            ready: function (a) {
                if (a === true ? !--c.readyWait : !c.isReady) {
                    if (!m.body) return setTimeout(c.ready);
                    c.isReady = true;
                    a !== true && --c.readyWait > 0 || (ja.resolveWith(m, [c]), c.fn.trigger && c(m).trigger("ready").off("ready"))
                }
            },
            isFunction: function (a) {
                return "function" === c.type(a)
            },
            isArray: Array.isArray || function (a) {
                return "array" === c.type(a)
            },
            isWindow: function (a) {
                return null != a && a == a.window
            },
            isNumeric: function (a) {
                return !isNaN(parseFloat(a)) && isFinite(a)
            },
            type: function (a) {
                return null == a ? a + "" : "object" == typeof a || "function" == typeof a ? ka[cc.call(a)] || "object" : typeof a
            },
            isPlainObject: function (a) {
                if (!a || "object" !== c.type(a) || a.nodeType || c.isWindow(a)) return false;
                try {
                    if (a.constructor && !fa.call(a, "constructor") && !fa.call(a.constructor.prototype, "isPrototypeOf")) return false
                } catch (b) {
                    return false
                }
                for (var d in a);
                return d === k || fa.call(a, d)
            },
            isEmptyObject: function (a) {
                for (var b in a) return false;
                return true
            },
            error: function (a) {
                throw Error(a);
            },
            parseHTML: function (a, b, d) {
                if (!a || "string" != typeof a) return null;
                "boolean" == typeof b && (d = b, b = false);
                b = b || m;
                var e = sb.exec(a),
                    d = !d && [];
                return e ? [b.createElement(e[1])] : (e = c.buildFragment([a], b, d), d && c(d).remove(), c.merge([], e.childNodes))
            },
            parseJSON: function (a) {
                return q.JSON && q.JSON.parse ? q.JSON.parse(a) : null === a ? a : "string" == typeof a && (a = c.trim(a), a && fc.test(a.replace(hc, "@").replace(ic, "]").replace(gc, ""))) ? Function("return " + a)() : (c.error("Invalid JSON: " +
                    a), k)
            },
            parseXML: function (a) {
                var b, d;
                if (!a || "string" != typeof a) return null;
                try {
                    q.DOMParser ? (d = new DOMParser, b = d.parseFromString(a, "text/xml")) : (b = new ActiveXObject("Microsoft.XMLDOM"), b.async = "false", b.loadXML(a))
                } catch (e) {
                    b = k
                }
                return b && b.documentElement && !b.getElementsByTagName("parsererror").length || c.error("Invalid XML: " + a), b
            },
            noop: function () {},
            globalEval: function (a) {
                a && c.trim(a) && (q.execScript || function (a) {
                    q.eval.call(q, a)
                })(a)
            },
            camelCase: function (a) {
                return a.replace(jc, "ms-").replace(kc, lc)
            },
            nodeName: function (a, b) {
                return a.nodeName && a.nodeName.toLowerCase() === b.toLowerCase()
            },
            each: function (a, b, c) {
                var e, f = 0,
                    g = a.length,
                    h = qa(a);
                if (c)
                    if (h)
                        for (; g > f; f++) {
                            if (e = b.apply(a[f], c), e === false) break
                        } else
                            for (f in a) {
                                if (e = b.apply(a[f], c), e === false) break
                            } else if (h)
                                for (; g > f; f++) {
                                    if (e = b.call(a[f], f, a[f]), e === false) break
                                } else
                                    for (f in a)
                                        if (e = b.call(a[f], f, a[f]), e === false) break;
                return a
            },
            trim: Aa && !Aa.call("\ufeff\u00a0") ? function (a) {
                return null == a ? "" : Aa.call(a)
            } : function (a) {
                return null == a ? "" : (a + "").replace(dc,
                    "")
            },
            makeArray: function (a, b) {
                var d = b || [];
                return null != a && (qa(Object(a)) ? c.merge(d, "string" == typeof a ? [a] : a) : za.call(d, a)), d
            },
            inArray: function (a, b, c) {
                var e;
                if (b) {
                    if (rb) return rb.call(b, a, c);
                    for (e = b.length, c = c ? 0 > c ? Math.max(0, e + c) : c : 0; e > c; c++)
                        if (c in b && b[c] === a) return c
                }
                return -1
            },
            merge: function (a, b) {
                var c = b.length,
                    e = a.length,
                    f = 0;
                if ("number" == typeof c)
                    for (; c > f; f++) a[e++] = b[f];
                else
                    for (; b[f] !== k;) a[e++] = b[f++];
                return a.length = e, a
            },
            grep: function (a, b, c) {
                for (var e, f = [], g = 0, h = a.length, c = !!c; h > g; g++) e = !!b(a[g],
                    g), c !== e && f.push(a[g]);
                return f
            },
            map: function (a, b, c) {
                var e, f = 0,
                    g = a.length,
                    h = [];
                if (qa(a))
                    for (; g > f; f++) e = b(a[f], f, c), null != e && (h[h.length] = e);
                else
                    for (f in a) e = b(a[f], f, c), null != e && (h[h.length] = e);
                return qb.apply([], h)
            },
            guid: 1,
            proxy: function (a, b) {
                var d, e, f;
                return "string" == typeof b && (f = a[b], b = a, a = f), c.isFunction(a) ? (d = Q.call(arguments, 2), e = function () {
                    return a.apply(b || this, d.concat(Q.call(arguments)))
                }, e.guid = a.guid = a.guid || c.guid++, e) : k
            },
            access: function (a, b, d, e, f, g, h) {
                var i = 0,
                    j = a.length,
                    o = null == d;
                if ("object" ===
                    c.type(d))
                    for (i in f = true, d) c.access(a, b, i, d[i], true, g, h);
                else if (e !== k && (f = true, c.isFunction(e) || (h = true), o && (h ? (b.call(a, e), b = null) : (o = b, b = function (a, b, d) {
                        return o.call(c(a), d)
                    })), b))
                    for (; j > i; i++) b(a[i], d, h ? e : e.call(a[i], i, b(a[i], d)));
                return f ? a : o ? b.call(a) : j ? b(a[0], d) : g
            },
            now: function () {
                return (new Date).getTime()
            }
        });
        c.ready.promise = function (a) {
            if (!ja)
                if (ja = c.Deferred(), "complete" === m.readyState) setTimeout(c.ready);
                else if (m.addEventListener) m.addEventListener("DOMContentLoaded", M, false), q.addEventListener("load",
                M, false);
            else {
                m.attachEvent("onreadystatechange", M);
                q.attachEvent("onload", M);
                var b = false;
                try {
                    b = null == q.frameElement && m.documentElement
                } catch (d) {}
                b && b.doScroll && function f() {
                    if (!c.isReady) {
                        try {
                            b.doScroll("left")
                        } catch (a) {
                            return setTimeout(f, 50)
                        }
                        tb();
                        c.ready()
                    }
                }()
            }
            return ja.promise(a)
        };
        c.each("Boolean Number String Function Array Date RegExp Object Error".split(" "), function (a, b) {
            ka["[object " + b + "]"] = b.toLowerCase()
        });
        pb = c(m);
        var Qa = {};
        c.Callbacks = function (a) {
            var a = "string" == typeof a ? Qa[a] || Qb(a) :
                c.extend({}, a),
                b, d, e, f, g, h, i = [],
                j = !a.once && [],
                o = function (c) {
                    for (d = a.memory && c, e = true, g = h || 0, h = 0, f = i.length, b = true; i && f > g; g++)
                        if (i[g].apply(c[0], c[1]) === false && a.stopOnFalse) {
                            d = false;
                            break
                        }
                    b = false;
                    i && (j ? j.length && o(j.shift()) : d ? i = [] : l.disable())
                },
                l = {
                    add: function () {
                        if (i) {
                            var e = i.length;
                            (function p(b) {
                                c.each(b, function (b, d) {
                                    var e = c.type(d);
                                    "function" === e ? a.unique && l.has(d) || i.push(d) : d && d.length && "string" !== e && p(d)
                                })
                            })(arguments);
                            b ? f = i.length : d && (h = e, o(d))
                        }
                        return this
                    },
                    remove: function () {
                        return i && c.each(arguments,
                            function (a, d) {
                                for (var e;
                                    (e = c.inArray(d, i, e)) > -1;) i.splice(e, 1), b && (f >= e && f--, g >= e && g--)
                            }), this
                    },
                    has: function (a) {
                        return a ? c.inArray(a, i) > -1 : !(!i || !i.length)
                    },
                    empty: function () {
                        return i = [], this
                    },
                    disable: function () {
                        return i = j = d = k, this
                    },
                    disabled: function () {
                        return !i
                    },
                    lock: function () {
                        return j = k, d || l.disable(), this
                    },
                    locked: function () {
                        return !j
                    },
                    fireWith: function (a, c) {
                        return c = c || [], c = [a, c.slice ? c.slice() : c], !i || e && !j || (b ? j.push(c) : o(c)), this
                    },
                    fire: function () {
                        return l.fireWith(this, arguments), this
                    },
                    fired: function () {
                        return !!e
                    }
                };
            return l
        };
        c.extend({
            Deferred: function (a) {
                var b = [["resolve", "done", c.Callbacks("once memory"), "resolved"], ["reject", "fail", c.Callbacks("once memory"), "rejected"], ["notify", "progress", c.Callbacks("memory")]],
                    d = "pending",
                    e = {
                        state: function () {
                            return d
                        },
                        always: function () {
                            return f.done(arguments).fail(arguments), this
                        },
                        then: function () {
                            var a = arguments;
                            return c.Deferred(function (d) {
                                c.each(b, function (b, j) {
                                    var o = j[0],
                                        l = c.isFunction(a[b]) && a[b];
                                    f[j[1]](function () {
                                        var a = l && l.apply(this, arguments);
                                        a && c.isFunction(a.promise) ?
                                            a.promise().done(d.resolve).fail(d.reject).progress(d.notify) : d[o + "With"](this === e ? d.promise() : this, l ? [a] : arguments)
                                    })
                                });
                                a = null
                            }).promise()
                        },
                        promise: function (a) {
                            return null != a ? c.extend(a, e) : e
                        }
                    },
                    f = {};
                return e.pipe = e.then, c.each(b, function (a, c) {
                    var i = c[2],
                        j = c[3];
                    e[c[1]] = i.add;
                    j && i.add(function () {
                        d = j
                    }, b[1 ^ a][2].disable, b[2][2].lock);
                    f[c[0]] = function () {
                        return f[c[0] + "With"](this === f ? e : this, arguments), this
                    };
                    f[c[0] + "With"] = i.fireWith
                }), e.promise(f), a && a.call(f, f), f
            },
            when: function (a) {
                var b = 0,
                    d = Q.call(arguments),
                    e = d.length,
                    f = 1 !== e || a && c.isFunction(a.promise) ? e : 0,
                    g = 1 === f ? a : c.Deferred(),
                    h = function (a, b, c) {
                        return function (d) {
                            b[a] = this;
                            c[a] = arguments.length > 1 ? Q.call(arguments) : d;
                            c === i ? g.notifyWith(b, c) : --f || g.resolveWith(b, c)
                        }
                    },
                    i, j, o;
                if (e > 1)
                    for (i = Array(e), j = Array(e), o = Array(e); e > b; b++) d[b] && c.isFunction(d[b].promise) ? d[b].promise().done(h(b, o, d)).fail(g.reject).progress(h(b, j, i)) : --f;
                return f || g.resolveWith(o, d), g.promise()
            }
        });
        c.support = function () {
            var a, b, d, e, f, g, h, i, j, o, l = m.createElement("div");
            if (l.setAttribute("className",
                    "t"), l.innerHTML = "  <link/><table></table><a href='/a'>a</a><input type='checkbox'/>", b = l.getElementsByTagName("*"), d = l.getElementsByTagName("a")[0], !b || !d || !b.length) return {};
            f = m.createElement("select");
            h = f.appendChild(m.createElement("option"));
            e = l.getElementsByTagName("input")[0];
            d.style.cssText = "top:1px;float:left;opacity:.5";
            a = {
                getSetAttribute: "t" !== l.className,
                leadingWhitespace: 3 === l.firstChild.nodeType,
                tbody: !l.getElementsByTagName("tbody").length,
                htmlSerialize: !!l.getElementsByTagName("link").length,
                style: /top/.test(d.getAttribute("style")),
                hrefNormalized: "/a" === d.getAttribute("href"),
                opacity: /^0.5/.test(d.style.opacity),
                cssFloat: !!d.style.cssFloat,
                checkOn: !!e.value,
                optSelected: h.selected,
                enctype: !!m.createElement("form").enctype,
                html5Clone: "<:nav></:nav>" !== m.createElement("nav").cloneNode(true).outerHTML,
                boxModel: "CSS1Compat" === m.compatMode,
                deleteExpando: true,
                noCloneEvent: true,
                inlineBlockNeedsLayout: false,
                shrinkWrapBlocks: false,
                reliableMarginRight: true,
                boxSizingReliable: true,
                pixelPosition: false
            };
            e.checked = true;
            a.noCloneChecked = e.cloneNode(true).checked;
            f.disabled = true;
            a.optDisabled = !h.disabled;
            try {
                delete l.test
            } catch (n) {
                a.deleteExpando = false
            }
            e = m.createElement("input");
            e.setAttribute("value", "");
            a.input = "" === e.getAttribute("value");
            e.value = "t";
            e.setAttribute("type", "radio");
            a.radioValue = "t" === e.value;
            e.setAttribute("checked", "t");
            e.setAttribute("name", "t");
            g = m.createDocumentFragment();
            g.appendChild(e);
            a.appendChecked = e.checked;
            a.checkClone = g.cloneNode(true).cloneNode(true).lastChild.checked;
            l.attachEvent && (l.attachEvent("onclick", function () {
                a.noCloneEvent = false
            }), l.cloneNode(true).click());
            for (o in {
                    submit: true,
                    change: true,
                    focusin: true
                }) l.setAttribute(i = "on" + o, "t"), a[o + "Bubbles"] = i in q || l.attributes[i].expando === false;
            return l.style.backgroundClip = "content-box", l.cloneNode(true).style.backgroundClip = "", a.clearCloneStyle = "content-box" === l.style.backgroundClip, c(function () {
                var b, c, d, e = m.getElementsByTagName("body")[0];
                e && (b = m.createElement("div"), b.style.cssText = "border:0;width:0;height:0;position:absolute;top:0;left:-9999px;margin-top:1px",
                    e.appendChild(b).appendChild(l), l.innerHTML = "<table><tr><td></td><td>t</td></tr></table>", d = l.getElementsByTagName("td"), d[0].style.cssText = "padding:0;margin:0;border:0;display:none", j = 0 === d[0].offsetHeight, d[0].style.display = "", d[1].style.display = "none", a.reliableHiddenOffsets = j && 0 === d[0].offsetHeight, l.innerHTML = "", l.style.cssText = "box-sizing:border-box;-moz-box-sizing:border-box;-webkit-box-sizing:border-box;padding:1px;border:1px;display:block;width:4px;margin-top:1%;position:absolute;top:1%;",
                    a.boxSizing = 4 === l.offsetWidth, a.doesNotIncludeMarginInBodyOffset = 1 !== e.offsetTop, q.getComputedStyle && (a.pixelPosition = "1%" !== (q.getComputedStyle(l, null) || {}).top, a.boxSizingReliable = "4px" === (q.getComputedStyle(l, null) || {
                        width: "4px"
                    }).width, c = l.appendChild(m.createElement("div")), c.style.cssText = l.style.cssText = "padding:0;margin:0;border:0;display:block;box-sizing:content-box;-moz-box-sizing:content-box;-webkit-box-sizing:content-box;", c.style.marginRight = c.style.width = "0", l.style.width = "1px", a.reliableMarginRight = !parseFloat((q.getComputedStyle(c, null) || {}).marginRight)), typeof l.style.zoom !== w && (l.innerHTML = "", l.style.cssText = "padding:0;margin:0;border:0;display:block;box-sizing:content-box;-moz-box-sizing:content-box;-webkit-box-sizing:content-box;width:1px;padding:1px;display:inline;zoom:1", a.inlineBlockNeedsLayout = 3 === l.offsetWidth, l.style.display = "block", l.innerHTML = "<div></div>", l.firstChild.style.width = "5px", a.shrinkWrapBlocks = 3 !== l.offsetWidth, a.inlineBlockNeedsLayout && (e.style.zoom = 1)), e.removeChild(b),
                    l = null)
            }), b = f = g = h = d = e = null, a
        }();
        var Sb = /(?:\{[\s\S]*\}|\[[\s\S]*\])$/,
            Rb = /([A-Z])/g;
        c.extend({
            cache: {},
            expando: "jQuery" + ("1.9.1" + Math.random()).replace(/\D/g, ""),
            noData: {
                embed: true,
                object: "clsid:D27CDB6E-AE6D-11cf-96B8-444553540000",
                applet: true
            },
            hasData: function (a) {
                return a = a.nodeType ? c.cache[a[c.expando]] : a[c.expando], !!a && !ra(a)
            },
            data: function (a, b, c) {
                return Ra(a, b, c)
            },
            removeData: function (a, b) {
                return Sa(a, b)
            },
            _data: function (a, b, c) {
                return Ra(a, b, c, true)
            },
            _removeData: function (a, b) {
                return Sa(a, b, true)
            },
            acceptData: function (a) {
                if (a.nodeType && 1 !== a.nodeType && 9 !== a.nodeType) return false;
                var b = a.nodeName && c.noData[a.nodeName.toLowerCase()];
                return !b || b !== true && a.getAttribute("classid") === b
            }
        });
        c.fn.extend({
            data: function (a, b) {
                var d, e, f = this[0],
                    g = 0,
                    h = null;
                if (a === k) {
                    if (this.length && (h = c.data(f), 1 === f.nodeType && !c._data(f, "parsedAttrs"))) {
                        for (d = f.attributes; d.length > g; g++) e = d[g].name, e.indexOf("data-") || (e = c.camelCase(e.slice(5)), Ta(f, e, h[e]));
                        c._data(f, "parsedAttrs", true)
                    }
                    return h
                }
                return "object" == typeof a ?
                    this.each(function () {
                        c.data(this, a)
                    }) : c.access(this, function (b) {
                        return b === k ? f ? Ta(f, a, c.data(f, a)) : null : (this.each(function () {
                            c.data(this, a, b)
                        }), k)
                    }, null, b, arguments.length > 1, null, true)
            },
            removeData: function (a) {
                return this.each(function () {
                    c.removeData(this, a)
                })
            }
        });
        c.extend({
            queue: function (a, b, d) {
                var e;
                return a ? (b = (b || "fx") + "queue", e = c._data(a, b), d && (!e || c.isArray(d) ? e = c._data(a, b, c.makeArray(d)) : e.push(d)), e || []) : k
            },
            dequeue: function (a, b) {
                var b = b || "fx",
                    d = c.queue(a, b),
                    e = d.length,
                    f = d.shift(),
                    g = c._queueHooks(a,
                        b),
                    h = function () {
                        c.dequeue(a, b)
                    };
                "inprogress" === f && (f = d.shift(), e--);
                g.cur = f;
                f && ("fx" === b && d.unshift("inprogress"), delete g.stop, f.call(a, h, g));
                !e && g && g.empty.fire()
            },
            _queueHooks: function (a, b) {
                var d = b + "queueHooks";
                return c._data(a, d) || c._data(a, d, {
                    empty: c.Callbacks("once memory").add(function () {
                        c._removeData(a, b + "queue");
                        c._removeData(a, d)
                    })
                })
            }
        });
        c.fn.extend({
            queue: function (a, b) {
                var d = 2;
                return "string" != typeof a && (b = a, a = "fx", d--), d > arguments.length ? c.queue(this[0], a) : b === k ? this : this.each(function () {
                    var d =
                        c.queue(this, a, b);
                    c._queueHooks(this, a);
                    "fx" === a && "inprogress" !== d[0] && c.dequeue(this, a)
                })
            },
            dequeue: function (a) {
                return this.each(function () {
                    c.dequeue(this, a)
                })
            },
            delay: function (a, b) {
                return a = c.fx ? c.fx.speeds[a] || a : a, b = b || "fx", this.queue(b, function (b, c) {
                    var f = setTimeout(b, a);
                    c.stop = function () {
                        clearTimeout(f)
                    }
                })
            },
            clearQueue: function (a) {
                return this.queue(a || "fx", [])
            },
            promise: function (a, b) {
                var d, e = 1,
                    f = c.Deferred(),
                    g = this,
                    h = this.length,
                    i = function () {
                        --e || f.resolveWith(g, [g])
                    };
                for ("string" != typeof a && (b =
                        a, a = k), a = a || "fx"; h--;) d = c._data(g[h], a + "queueHooks"), d && d.empty && (e++, d.empty.add(i));
                return i(), f.promise(b)
            }
        });
        var N, ub, Ba = /[\t\r\n]/g,
            mc = /\r/g,
            nc = /^(?:input|select|textarea|button|object)$/i,
            oc = /^(?:a|area)$/i,
            vb = /^(?:checked|selected|autofocus|autoplay|async|controls|defer|disabled|hidden|loop|multiple|open|readonly|required|scoped)$/i,
            Ca = /^(?:checked|selected)$/i,
            R = c.support.getSetAttribute,
            Da = c.support.input;
        c.fn.extend({
            attr: function (a, b) {
                return c.access(this, c.attr, a, b, arguments.length > 1)
            },
            removeAttr: function (a) {
                return this.each(function () {
                    c.removeAttr(this, a)
                })
            },
            prop: function (a, b) {
                return c.access(this, c.prop, a, b, arguments.length > 1)
            },
            removeProp: function (a) {
                return a = c.propFix[a] || a, this.each(function () {
                    try {
                        this[a] = k, delete this[a]
                    } catch (b) {}
                })
            },
            addClass: function (a) {
                var b, d, e, f, g, h = 0,
                    i = this.length;
                b = "string" == typeof a && a;
                if (c.isFunction(a)) return this.each(function (b) {
                    c(this).addClass(a.call(this, b, this.className))
                });
                if (b)
                    for (b = (a || "").match(F) || []; i > h; h++)
                        if (d = this[h], e = 1 === d.nodeType &&
                            (d.className ? (" " + d.className + " ").replace(Ba, " ") : " ")) {
                            for (g = 0; f = b[g++];) 0 > e.indexOf(" " + f + " ") && (e += f + " ");
                            d.className = c.trim(e)
                        }
                return this
            },
            removeClass: function (a) {
                var b, d, e, f, g, h = 0,
                    i = this.length;
                b = 0 === arguments.length || "string" == typeof a && a;
                if (c.isFunction(a)) return this.each(function (b) {
                    c(this).removeClass(a.call(this, b, this.className))
                });
                if (b)
                    for (b = (a || "").match(F) || []; i > h; h++)
                        if (d = this[h], e = 1 === d.nodeType && (d.className ? (" " + d.className + " ").replace(Ba, " ") : "")) {
                            for (g = 0; f = b[g++];)
                                for (; e.indexOf(" " +
                                        f + " ") >= 0;) e = e.replace(" " + f + " ", " ");
                            d.className = a ? c.trim(e) : ""
                        }
                return this
            },
            toggleClass: function (a, b) {
                var d = typeof a,
                    e = "boolean" == typeof b;
                return c.isFunction(a) ? this.each(function (d) {
                    c(this).toggleClass(a.call(this, d, this.className, b), b)
                }) : this.each(function () {
                    if ("string" === d)
                        for (var f, g = 0, h = c(this), i = b, j = a.match(F) || []; f = j[g++];) i = e ? i : !h.hasClass(f), h[i ? "addClass" : "removeClass"](f);
                    else(d === w || "boolean" === d) && (this.className && c._data(this, "__className__", this.className), this.className = this.className ||
                        a === false ? "" : c._data(this, "__className__") || "")
                })
            },
            hasClass: function (a) {
                for (var a = " " + a + " ", b = 0, c = this.length; c > b; b++)
                    if (1 === this[b].nodeType && (" " + this[b].className + " ").replace(Ba, " ").indexOf(a) >= 0) return true;
                return false
            },
            val: function (a) {
                var b, d, e, f = this[0];
                if (arguments.length) return e = c.isFunction(a), this.each(function (b) {
                    var f, i = c(this);
                    1 === this.nodeType && (f = e ? a.call(this, b, i.val()) : a, null == f ? f = "" : "number" == typeof f ? f += "" : c.isArray(f) && (f = c.map(f, function (a) {
                            return null == a ? "" : a + ""
                        })), d = c.valHooks[this.type] ||
                        c.valHooks[this.nodeName.toLowerCase()], d && "set" in d && d.set(this, f, "value") !== k || (this.value = f))
                });
                if (f) return d = c.valHooks[f.type] || c.valHooks[f.nodeName.toLowerCase()], d && "get" in d && (b = d.get(f, "value")) !== k ? b : (b = f.value, "string" == typeof b ? b.replace(mc, "") : null == b ? "" : b)
            }
        });
        c.extend({
            valHooks: {
                option: {
                    get: function (a) {
                        var b = a.attributes.value;
                        return !b || b.specified ? a.value : a.text
                    }
                },
                select: {
                    get: function (a) {
                        for (var b, d = a.options, e = a.selectedIndex, f = "select-one" === a.type || 0 > e, g = f ? null : [], h = f ? e + 1 : d.length,
                                i = 0 > e ? h : f ? e : 0; h > i; i++)
                            if (b = d[i], !(!b.selected && i !== e || (c.support.optDisabled ? b.disabled : null !== b.getAttribute("disabled")) || b.parentNode.disabled && c.nodeName(b.parentNode, "optgroup"))) {
                                if (a = c(b).val(), f) return a;
                                g.push(a)
                            }
                        return g
                    },
                    set: function (a, b) {
                        var d = c.makeArray(b);
                        return c(a).find("option").each(function () {
                            this.selected = c.inArray(c(this).val(), d) >= 0
                        }), d.length || (a.selectedIndex = -1), d
                    }
                }
            },
            attr: function (a, b, d) {
                var e, f, g, h = a.nodeType;
                if (a && 3 !== h && 8 !== h && 2 !== h) return typeof a.getAttribute === w ? c.prop(a,
                    b, d) : (f = 1 !== h || !c.isXMLDoc(a), f && (b = b.toLowerCase(), e = c.attrHooks[b] || (vb.test(b) ? ub : N)), d === k ? e && f && "get" in e && null !== (g = e.get(a, b)) ? g : (typeof a.getAttribute !== w && (g = a.getAttribute(b)), null == g ? k : g) : null !== d ? e && f && "set" in e && (g = e.set(a, d, b)) !== k ? g : (a.setAttribute(b, d + ""), d) : (c.removeAttr(a, b), k))
            },
            removeAttr: function (a, b) {
                var d, e, f = 0,
                    g = b && b.match(F);
                if (g && 1 === a.nodeType)
                    for (; d = g[f++];) e = c.propFix[d] || d, vb.test(d) ? !R && Ca.test(d) ? a[c.camelCase("default-" + d)] = a[e] = false : a[e] = false : c.attr(a, d, ""), a.removeAttribute(R ?
                        d : e)
            },
            attrHooks: {
                type: {
                    set: function (a, b) {
                        if (!c.support.radioValue && "radio" === b && c.nodeName(a, "input")) {
                            var d = a.value;
                            return a.setAttribute("type", b), d && (a.value = d), b
                        }
                    }
                }
            },
            propFix: {
                tabindex: "tabIndex",
                readonly: "readOnly",
                "for": "htmlFor",
                "class": "className",
                maxlength: "maxLength",
                cellspacing: "cellSpacing",
                cellpadding: "cellPadding",
                rowspan: "rowSpan",
                colspan: "colSpan",
                usemap: "useMap",
                frameborder: "frameBorder",
                contenteditable: "contentEditable"
            },
            prop: function (a, b, d) {
                var e, f, g, h = a.nodeType;
                if (a && 3 !== h && 8 !==
                    h && 2 !== h) return g = 1 !== h || !c.isXMLDoc(a), g && (b = c.propFix[b] || b, f = c.propHooks[b]), d !== k ? f && "set" in f && (e = f.set(a, d, b)) !== k ? e : a[b] = d : f && "get" in f && null !== (e = f.get(a, b)) ? e : a[b]
            },
            propHooks: {
                tabIndex: {
                    get: function (a) {
                        var b = a.getAttributeNode("tabindex");
                        return b && b.specified ? parseInt(b.value, 10) : nc.test(a.nodeName) || oc.test(a.nodeName) && a.href ? 0 : k
                    }
                }
            }
        });
        ub = {
            get: function (a, b) {
                var d = c.prop(a, b),
                    e = "boolean" == typeof d && a.getAttribute(b);
                return (d = "boolean" == typeof d ? Da && R ? null != e : Ca.test(b) ? a[c.camelCase("default-" +
                    b)] : !!e : a.getAttributeNode(b)) && d.value !== false ? b.toLowerCase() : k
            },
            set: function (a, b, d) {
                return b === false ? c.removeAttr(a, d) : Da && R || !Ca.test(d) ? a.setAttribute(!R && c.propFix[d] || d, d) : a[c.camelCase("default-" + d)] = a[d] = true, d
            }
        };
        Da && R || (c.attrHooks.value = {
            get: function (a, b) {
                var d = a.getAttributeNode(b);
                return c.nodeName(a, "input") ? a.defaultValue : d && d.specified ? d.value : k
            },
            set: function (a, b, d) {
                return c.nodeName(a, "input") ? (a.defaultValue = b, k) : N && N.set(a, b, d)
            }
        });
        R || (N = c.valHooks.button = {
            get: function (a, b) {
                var c =
                    a.getAttributeNode(b);
                return c && ("id" === b || "name" === b || "coords" === b ? "" !== c.value : c.specified) ? c.value : k
            },
            set: function (a, b, c) {
                var e = a.getAttributeNode(c);
                return e || a.setAttributeNode(e = a.ownerDocument.createAttribute(c)), e.value = b += "", "value" === c || b === a.getAttribute(c) ? b : k
            }
        }, c.attrHooks.contenteditable = {
            get: N.get,
            set: function (a, b, c) {
                N.set(a, "" === b ? false : b, c)
            }
        }, c.each(["width", "height"], function (a, b) {
            c.attrHooks[b] = c.extend(c.attrHooks[b], {
                set: function (a, c) {
                    return "" === c ? (a.setAttribute(b, "auto"), c) :
                        k
                }
            })
        }));
        c.support.hrefNormalized || (c.each(["href", "src", "width", "height"], function (a, b) {
            c.attrHooks[b] = c.extend(c.attrHooks[b], {
                get: function (a) {
                    a = a.getAttribute(b, 2);
                    return null == a ? k : a
                }
            })
        }), c.each(["href", "src"], function (a, b) {
            c.propHooks[b] = {
                get: function (a) {
                    return a.getAttribute(b, 4)
                }
            }
        }));
        c.support.style || (c.attrHooks.style = {
            get: function (a) {
                return a.style.cssText || k
            },
            set: function (a, b) {
                return a.style.cssText = b + ""
            }
        });
        c.support.optSelected || (c.propHooks.selected = c.extend(c.propHooks.selected, {
            get: function () {
                return null
            }
        }));
        c.support.enctype || (c.propFix.enctype = "encoding");
        c.support.checkOn || c.each(["radio", "checkbox"], function () {
            c.valHooks[this] = {
                get: function (a) {
                    return null === a.getAttribute("value") ? "on" : a.value
                }
            }
        });
        c.each(["radio", "checkbox"], function () {
            c.valHooks[this] = c.extend(c.valHooks[this], {
                set: function (a, b) {
                    return c.isArray(b) ? a.checked = c.inArray(c(a).val(), b) >= 0 : k
                }
            })
        });
        var Ea = /^(?:input|select|textarea)$/i,
            pc = /^key/,
            qc = /^(?:mouse|contextmenu)|click/,
            wb = /^(?:focusinfocus|focusoutblur)$/,
            xb = /^([^.]*)(?:\.(.+)|)$/;
        c.event = {
            global: {},
            add: function (a, b, d, e, f) {
                var g, h, i, j, o, l, n, u, p, m, s;
                if (i = c._data(a)) {
                    for (d.handler && (j = d, d = j.handler, f = j.selector), d.guid || (d.guid = c.guid++), (h = i.events) || (h = i.events = {}), (l = i.handle) || (l = i.handle = function (a) {
                            return typeof c === w || a && c.event.triggered === a.type ? k : c.event.dispatch.apply(l.elem, arguments)
                        }, l.elem = a), b = (b || "").match(F) || [""], i = b.length; i--;) g = xb.exec(b[i]) || [], p = s = g[1], m = (g[2] || "").split(".").sort(), o = c.event.special[p] || {}, p = (f ? o.delegateType : o.bindType) || p, o = c.event.special[p] || {}, n = c.extend({
                        type: p,
                        origType: s,
                        data: e,
                        handler: d,
                        guid: d.guid,
                        selector: f,
                        needsContext: f && c.expr.match.needsContext.test(f),
                        namespace: m.join(".")
                    }, j), (u = h[p]) || (u = h[p] = [], u.delegateCount = 0, o.setup && o.setup.call(a, e, m, l) !== false || (a.addEventListener ? a.addEventListener(p, l, false) : a.attachEvent && a.attachEvent("on" + p, l))), o.add && (o.add.call(a, n), n.handler.guid || (n.handler.guid = d.guid)), f ? u.splice(u.delegateCount++, 0, n) : u.push(n), c.event.global[p] = true;
                    a = null
                }
            },
            remove: function (a, b, d, e, f) {
                var g, h, i, j, o,
                    l, n, k, p, m, s, q = c.hasData(a) && c._data(a);
                if (q && (l = q.events)) {
                    for (b = (b || "").match(F) || [""], o = b.length; o--;)
                        if (i = xb.exec(b[o]) || [], p = s = i[1], m = (i[2] || "").split(".").sort(), p) {
                            for (n = c.event.special[p] || {}, p = (e ? n.delegateType : n.bindType) || p, k = l[p] || [], i = i[2] && RegExp("(^|\\.)" + m.join("\\.(?:.*\\.|)") + "(\\.|$)"), j = g = k.length; g--;) h = k[g], !f && s !== h.origType || d && d.guid !== h.guid || i && !i.test(h.namespace) || e && e !== h.selector && ("**" !== e || !h.selector) || (k.splice(g, 1), h.selector && k.delegateCount--, n.remove && n.remove.call(a,
                                h));
                            j && !k.length && (n.teardown && n.teardown.call(a, m, q.handle) !== false || c.removeEvent(a, p, q.handle), delete l[p])
                        } else
                            for (p in l) c.event.remove(a, p + b[o], d, e, true);
                    c.isEmptyObject(l) && (delete q.handle, c._removeData(a, "events"))
                }
            },
            trigger: function (a, b, d, e) {
                var f, g, h, i, j, o, l, n = [d || m],
                    u = fa.call(a, "type") ? a.type : a;
                l = fa.call(a, "namespace") ? a.namespace.split(".") : [];
                if (h = o = d = d || m, 3 !== d.nodeType && 8 !== d.nodeType && !wb.test(u + c.event.triggered) && (u.indexOf(".") >= 0 && (l = u.split("."), u = l.shift(), l.sort()), g = 0 > u.indexOf(":") &&
                        "on" + u, a = a[c.expando] ? a : new c.Event(u, "object" == typeof a && a), a.isTrigger = true, a.namespace = l.join("."), a.namespace_re = a.namespace ? RegExp("(^|\\.)" + l.join("\\.(?:.*\\.|)") + "(\\.|$)") : null, a.result = k, a.target || (a.target = d), b = null == b ? [a] : c.makeArray(b, [a]), j = c.event.special[u] || {}, e || !j.trigger || j.trigger.apply(d, b) !== false)) {
                    if (!e && !j.noBubble && !c.isWindow(d)) {
                        for (i = j.delegateType || u, wb.test(i + u) || (h = h.parentNode); h; h = h.parentNode) n.push(h), o = h;
                        o === (d.ownerDocument || m) && n.push(o.defaultView || o.parentWindow ||
                            q)
                    }
                    for (l = 0;
                        (h = n[l++]) && !a.isPropagationStopped();) a.type = l > 1 ? i : j.bindType || u, f = (c._data(h, "events") || {})[a.type] && c._data(h, "handle"), f && f.apply(h, b), f = g && h[g], f && c.acceptData(h) && f.apply && f.apply(h, b) === false && a.preventDefault();
                    if (a.type = u, !(e || a.isDefaultPrevented() || j._default && j._default.apply(d.ownerDocument, b) !== false || "click" === u && c.nodeName(d, "a") || !c.acceptData(d) || !g || !d[u] || c.isWindow(d))) {
                        o = d[g];
                        o && (d[g] = null);
                        c.event.triggered = u;
                        try {
                            d[u]()
                        } catch (p) {}
                        c.event.triggered = k;
                        o && (d[g] = o)
                    }
                    return a.result
                }
            },
            dispatch: function (a) {
                var a = c.event.fix(a),
                    b, d, e, f, g, h = [],
                    i = Q.call(arguments);
                b = (c._data(this, "events") || {})[a.type] || [];
                var j = c.event.special[a.type] || {};
                if (i[0] = a, a.delegateTarget = this, !j.preDispatch || j.preDispatch.call(this, a) !== false) {
                    for (h = c.event.handlers.call(this, a, b), b = 0;
                        (f = h[b++]) && !a.isPropagationStopped();)
                        for (a.currentTarget = f.elem, g = 0;
                            (e = f.handlers[g++]) && !a.isImmediatePropagationStopped();)(!a.namespace_re || a.namespace_re.test(e.namespace)) && (a.handleObj = e, a.data = e.data, d = ((c.event.special[e.origType] || {}).handle || e.handler).apply(f.elem, i), d !== k && (a.result = d) === false && (a.preventDefault(), a.stopPropagation()));
                    return j.postDispatch && j.postDispatch.call(this, a), a.result
                }
            },
            handlers: function (a, b) {
                var d, e, f, g, h = [],
                    i = b.delegateCount,
                    j = a.target;
                if (i && j.nodeType && (!a.button || "click" !== a.type))
                    for (; j != this; j = j.parentNode || this)
                        if (1 === j.nodeType && (j.disabled !== true || "click" !== a.type)) {
                            for (f = [], g = 0; i > g; g++) e = b[g], d = e.selector + " ", f[d] === k && (f[d] = e.needsContext ? c(d, this).index(j) >= 0 : c.find(d, this, null, [j]).length),
                                f[d] && f.push(e);
                            f.length && h.push({
                                elem: j,
                                handlers: f
                            })
                        }
                return b.length > i && h.push({
                    elem: this,
                    handlers: b.slice(i)
                }), h
            },
            fix: function (a) {
                if (a[c.expando]) return a;
                var b, d, e;
                b = a.type;
                var f = a,
                    g = this.fixHooks[b];
                for (g || (this.fixHooks[b] = g = qc.test(b) ? this.mouseHooks : pc.test(b) ? this.keyHooks : {}), e = g.props ? this.props.concat(g.props) : this.props, a = new c.Event(f), b = e.length; b--;) d = e[b], a[d] = f[d];
                return a.target || (a.target = f.srcElement || m), 3 === a.target.nodeType && (a.target = a.target.parentNode), a.metaKey = !!a.metaKey,
                    g.filter ? g.filter(a, f) : a
            },
            props: "altKey bubbles cancelable ctrlKey currentTarget eventPhase metaKey relatedTarget shiftKey target timeStamp view which".split(" "),
            fixHooks: {},
            keyHooks: {
                props: "char charCode key keyCode".split(" "),
                filter: function (a, b) {
                    return null == a.which && (a.which = null != b.charCode ? b.charCode : b.keyCode), a
                }
            },
            mouseHooks: {
                props: "button buttons clientX clientY fromElement offsetX offsetY pageX pageY screenX screenY toElement".split(" "),
                filter: function (a, b) {
                    var c, e, f, g = b.button,
                        h = b.fromElement;
                    return null == a.pageX && null != b.clientX && (e = a.target.ownerDocument || m, f = e.documentElement, c = e.body, a.pageX = b.clientX + (f && f.scrollLeft || c && c.scrollLeft || 0) - (f && f.clientLeft || c && c.clientLeft || 0), a.pageY = b.clientY + (f && f.scrollTop || c && c.scrollTop || 0) - (f && f.clientTop || c && c.clientTop || 0)), !a.relatedTarget && h && (a.relatedTarget = h === a.target ? b.toElement : h), a.which || g === k || (a.which = 1 & g ? 1 : 2 & g ? 3 : 4 & g ? 2 : 0), a
                }
            },
            special: {
                load: {
                    noBubble: true
                },
                click: {
                    trigger: function () {
                        return c.nodeName(this, "input") && "checkbox" === this.type &&
                            this.click ? (this.click(), false) : k
                    }
                },
                focus: {
                    trigger: function () {
                        if (this !== m.activeElement && this.focus) try {
                            return this.focus(), false
                        } catch (a) {}
                    },
                    delegateType: "focusin"
                },
                blur: {
                    trigger: function () {
                        return this === m.activeElement && this.blur ? (this.blur(), false) : k
                    },
                    delegateType: "focusout"
                },
                beforeunload: {
                    postDispatch: function (a) {
                        a.result !== k && (a.originalEvent.returnValue = a.result)
                    }
                }
            },
            simulate: function (a, b, d, e) {
                a = c.extend(new c.Event, d, {
                    type: a,
                    isSimulated: true,
                    originalEvent: {}
                });
                e ? c.event.trigger(a, null, b) : c.event.dispatch.call(b,
                    a);
                a.isDefaultPrevented() && d.preventDefault()
            }
        };
        c.removeEvent = m.removeEventListener ? function (a, b, c) {
            a.removeEventListener && a.removeEventListener(b, c, false)
        } : function (a, b, c) {
            b = "on" + b;
            a.detachEvent && (typeof a[b] === w && (a[b] = null), a.detachEvent(b, c))
        };
        c.Event = function (a, b) {
            return this instanceof c.Event ? (a && a.type ? (this.originalEvent = a, this.type = a.type, this.isDefaultPrevented = a.defaultPrevented || a.returnValue === false || a.getPreventDefault && a.getPreventDefault() ? ha : aa) : this.type = a, b && c.extend(this, b), this.timeStamp =
                a && a.timeStamp || c.now(), this[c.expando] = true, k) : new c.Event(a, b)
        };
        c.Event.prototype = {
            isDefaultPrevented: aa,
            isPropagationStopped: aa,
            isImmediatePropagationStopped: aa,
            preventDefault: function () {
                var a = this.originalEvent;
                this.isDefaultPrevented = ha;
                a && (a.preventDefault ? a.preventDefault() : a.returnValue = false)
            },
            stopPropagation: function () {
                var a = this.originalEvent;
                this.isPropagationStopped = ha;
                a && (a.stopPropagation && a.stopPropagation(), a.cancelBubble = true)
            },
            stopImmediatePropagation: function () {
                this.isImmediatePropagationStopped =
                    ha;
                this.stopPropagation()
            }
        };
        c.each({
            mouseenter: "mouseover",
            mouseleave: "mouseout"
        }, function (a, b) {
            c.event.special[a] = {
                delegateType: b,
                bindType: b,
                handle: function (a) {
                    var e, f = a.relatedTarget,
                        g = a.handleObj;
                    return (!f || f !== this && !c.contains(this, f)) && (a.type = g.origType, e = g.handler.apply(this, arguments), a.type = b), e
                }
            }
        });
        c.support.submitBubbles || (c.event.special.submit = {
            setup: function () {
                return c.nodeName(this, "form") ? false : (c.event.add(this, "click._submit keypress._submit", function (a) {
                    a = a.target;
                    (a = c.nodeName(a,
                        "input") || c.nodeName(a, "button") ? a.form : k) && !c._data(a, "submitBubbles") && (c.event.add(a, "submit._submit", function (a) {
                        a._submit_bubble = true
                    }), c._data(a, "submitBubbles", true))
                }), k)
            },
            postDispatch: function (a) {
                a._submit_bubble && (delete a._submit_bubble, this.parentNode && !a.isTrigger && c.event.simulate("submit", this.parentNode, a, true))
            },
            teardown: function () {
                return c.nodeName(this, "form") ? false : (c.event.remove(this, "._submit"), k)
            }
        });
        c.support.changeBubbles || (c.event.special.change = {
            setup: function () {
                return Ea.test(this.nodeName) ?
                    (("checkbox" === this.type || "radio" === this.type) && (c.event.add(this, "propertychange._change", function (a) {
                        "checked" === a.originalEvent.propertyName && (this._just_changed = true)
                    }), c.event.add(this, "click._change", function (a) {
                        this._just_changed && !a.isTrigger && (this._just_changed = false);
                        c.event.simulate("change", this, a, true)
                    })), false) : (c.event.add(this, "beforeactivate._change", function (a) {
                        a = a.target;
                        Ea.test(a.nodeName) && !c._data(a, "changeBubbles") && (c.event.add(a, "change._change", function (a) {
                            !this.parentNode ||
                                a.isSimulated || a.isTrigger || c.event.simulate("change", this.parentNode, a, true)
                        }), c._data(a, "changeBubbles", true))
                    }), k)
            },
            handle: function (a) {
                var b = a.target;
                return this !== b || a.isSimulated || a.isTrigger || "radio" !== b.type && "checkbox" !== b.type ? a.handleObj.handler.apply(this, arguments) : k
            },
            teardown: function () {
                return c.event.remove(this, "._change"), !Ea.test(this.nodeName)
            }
        });
        c.support.focusinBubbles || c.each({
            focus: "focusin",
            blur: "focusout"
        }, function (a, b) {
            var d = 0,
                e = function (a) {
                    c.event.simulate(b, a.target, c.event.fix(a),
                        true)
                };
            c.event.special[b] = {
                setup: function () {
                    0 === d++ && m.addEventListener(a, e, true)
                },
                teardown: function () {
                    0 === --d && m.removeEventListener(a, e, true)
                }
            }
        });
        c.fn.extend({
            on: function (a, b, d, e, f) {
                var g, h;
                if ("object" == typeof a) {
                    "string" != typeof b && (d = d || b, b = k);
                    for (g in a) this.on(g, b, d, a[g], f);
                    return this
                }
                if (null == d && null == e ? (e = b, d = b = k) : null == e && ("string" == typeof b ? (e = d, d = k) : (e = d, d = b, b = k)), e === false) e = aa;
                else if (!e) return this;
                return 1 === f && (h = e, e = function (a) {
                        return c().off(a), h.apply(this, arguments)
                    }, e.guid = h.guid ||
                    (h.guid = c.guid++)), this.each(function () {
                    c.event.add(this, a, e, d, b)
                })
            },
            one: function (a, b, c, e) {
                return this.on(a, b, c, e, 1)
            },
            off: function (a, b, d) {
                var e, f;
                if (a && a.preventDefault && a.handleObj) return e = a.handleObj, c(a.delegateTarget).off(e.namespace ? e.origType + "." + e.namespace : e.origType, e.selector, e.handler), this;
                if ("object" == typeof a) {
                    for (f in a) this.off(f, b, a[f]);
                    return this
                }
                return (b === false || "function" == typeof b) && (d = b, b = k), d === false && (d = aa), this.each(function () {
                    c.event.remove(this, a, d, b)
                })
            },
            bind: function (a,
                b, c) {
                return this.on(a, null, b, c)
            },
            unbind: function (a, b) {
                return this.off(a, null, b)
            },
            delegate: function (a, b, c, e) {
                return this.on(b, a, c, e)
            },
            undelegate: function (a, b, c) {
                return 1 === arguments.length ? this.off(a, "**") : this.off(b, a || "**", c)
            },
            trigger: function (a, b) {
                return this.each(function () {
                    c.event.trigger(a, b, this)
                })
            },
            triggerHandler: function (a, b) {
                var d = this[0];
                return d ? c.event.trigger(a, b, d, true) : k
            }
        });
        (function (a, b) {
            var d, e, f, g, h, i, j, o, l;

            function n(a) {
                return ja.test(a + "")
            }

            function k() {
                var a, b = [];
                return a = function (c,
                    d) {
                    return b.push(c += " ") > r.cacheLength && delete a[b.shift()], a[c] = d
                }
            }

            function p(a) {
                return a[D] = true, a
            }

            function m(a) {
                var b = z.createElement("div");
                try {
                    return a(b)
                } catch (c) {
                    return false
                } finally {}
            }

            function s(a, b, c, f) {
                var g, h, i, j, l, o;
                if ((b ? b.ownerDocument || b : y) !== z && ma(b), b = b || z, c = c || [], !a || "string" != typeof a) return c;
                if (1 !== (j = b.nodeType) && 9 !== j) return [];
                if (!G && !f) {
                    if (g = ka.exec(a))
                        if (i = g[1])
                            if (9 === j) {
                                if (h = b.getElementById(i), !h || !h.parentNode) return c;
                                if (h.id === i) return c.push(h), c
                            } else {
                                if (b.ownerDocument &&
                                    (h = b.ownerDocument.getElementById(i)) && I(b, h) && h.id === i) return c.push(h), c
                            } else {
                        if (g[2]) return L.apply(c, N.call(b.getElementsByTagName(a), 0)), c;
                        if ((i = g[3]) && d && b.getElementsByClassName) return L.apply(c, N.call(b.getElementsByClassName(i), 0)), c
                    }
                    if (e && !A.test(a)) {
                        if (g = true, h = D, i = b, o = 9 === j && a, 1 === j && "object" !== b.nodeName.toLowerCase()) {
                            for (l = x(a), (g = b.getAttribute("id")) ? h = g.replace(qa, "\\$&") : b.setAttribute("id", h), h = "[id='" + h + "'] ", j = l.length; j--;) l[j] = h + t(l[j]);
                            i = ba.test(a) && b.parentNode || b;
                            o = l.join(",")
                        }
                        if (o) try {
                            return L.apply(c,
                                N.call(i.querySelectorAll(o), 0)), c
                        } catch (n) {} finally {
                            g || b.removeAttribute("id")
                        }
                    }
                }
                var k;
                a: {
                    var a = a.replace(P, "$1"),
                        m, p;
                    g = x(a);
                    if (!f && 1 === g.length) {
                        if (k = g[0] = g[0].slice(0), k.length > 2 && "ID" === (m = k[0]).type && 9 === b.nodeType && !G && r.relative[k[1].type]) {
                            if (b = r.find.ID(m.matches[0].replace(ca, da), b)[0], !b) {
                                k = c;
                                break a
                            }
                            a = a.slice(k.shift().value.length)
                        }
                        for (l = X.needsContext.test(a) ? 0 : k.length; l--;) {
                            if (m = k[l], r.relative[j = m.type]) break;
                            if ((p = r.find[j]) && (f = p(m.matches[0].replace(ca, da), ba.test(k[0].type) &&
                                    b.parentNode || b))) {
                                if (k.splice(l, 1), a = f.length && t(k), !a) {
                                    k = (L.apply(c, N.call(f, 0)), c);
                                    break a
                                }
                                break
                            }
                        }
                    }
                    k = (Ga(a, g)(f, b, G, c, ba.test(a)), c)
                }
                return k
            }

            function q(a, b) {
                var c = b && a,
                    d = c && (~b.sourceIndex || U) - (~a.sourceIndex || U);
                if (d) return d;
                if (c)
                    for (; c = c.nextSibling;)
                        if (c === b) return -1;
                return a ? 1 : -1
            }

            function C(a) {
                return function (b) {
                    return "input" === b.nodeName.toLowerCase() && b.type === a
                }
            }

            function v(a) {
                return function (b) {
                    var c = b.nodeName.toLowerCase();
                    return ("input" === c || "button" === c) && b.type === a
                }
            }

            function H(a) {
                return p(function (b) {
                    return b = +b, p(function (c, d) {
                        for (var e, f = a([], c.length, b), g = f.length; g--;) c[e = f[g]] && (c[e] = !(d[e] = c[e]))
                    })
                })
            }

            function x(a, b) {
                var c, d, e, f, g, h, i;
                if (g = R[a + " "]) return b ? 0 : g.slice(0);
                for (g = a, h = [], i = r.preFilter; g;) {
                    (!c || (d = ea.exec(g))) && (d && (g = g.slice(d[0].length) || g), h.push(e = []));
                    c = false;
                    (d = fa.exec(g)) && (c = d.shift(), e.push({
                        value: c,
                        type: d[0].replace(P, " ")
                    }), g = g.slice(c.length));
                    for (f in r.filter) !(d = X[f].exec(g)) || i[f] && !(d = i[f](d)) || (c = d.shift(), e.push({
                        value: c,
                        type: f,
                        matches: d
                    }), g = g.slice(c.length));
                    if (!c) break
                }
                return b ?
                    g.length : g ? s.error(a) : R(a, h).slice(0)
            }

            function t(a) {
                for (var b = 0, c = a.length, d = ""; c > b; b++) d += a[b].value;
                return d
            }

            function w(a, b, c) {
                var d = b.dir,
                    e = c && "parentNode" === d,
                    f = W++;
                return b.first ? function (b, c, f) {
                    for (; b = b[d];)
                        if (1 === b.nodeType || e) return a(b, c, f)
                } : function (b, c, g) {
                    var h, i, Fa, j = Y + " " + f;
                    if (g)
                        for (; b = b[d];) {
                            if ((1 === b.nodeType || e) && a(b, c, g)) return true
                        } else
                            for (; b = b[d];)
                                if (1 === b.nodeType || e)
                                    if (Fa = b[D] || (b[D] = {}), (i = Fa[d]) && i[0] === j) {
                                        if ((h = i[1]) === true || h === ta) return h === true
                                    } else if (i = Fa[d] = [j], i[1] =
                        a(b, c, g) || ta, i[1] === true) return true
                }
            }

            function Ha(a) {
                return a.length > 1 ? function (b, c, d) {
                    for (var e = a.length; e--;)
                        if (!a[e](b, c, d)) return false;
                    return true
                } : a[0]
            }

            function ua(a, b, c, d, e) {
                for (var f, g = [], h = 0, i = a.length, j = null != b; i > h; h++)(f = a[h]) && (!c || c(f, d, e)) && (g.push(f), j && b.push(h));
                return g
            }

            function Ia(a, b, c, d, e, f) {
                return d && !d[D] && (d = Ia(d)), e && !e[D] && (e = Ia(e, f)), p(function (f, g, h, i) {
                    var j, l, k = [],
                        o = [],
                        n = g.length,
                        m;
                    if (!(m = f)) {
                        m = b || "*";
                        for (var p = h.nodeType ? [h] : h, u = [], r = 0, q = p.length; q > r; r++) s(m, p[r], u);
                        m = u
                    }
                    m = !a || !f && b ? m : ua(m, k, a, h, i);
                    p = c ? e || (f ? a : n || d) ? [] : g : m;
                    if (c && c(m, p, h, i), d)
                        for (j = ua(p, o), d(j, [], h, i), h = j.length; h--;)(l = j[h]) && (p[o[h]] = !(m[o[h]] = l));
                    if (f) {
                        if (e || a) {
                            if (e) {
                                for (j = [], h = p.length; h--;)(l = p[h]) && j.push(m[h] = l);
                                e(null, p = [], j, i)
                            }
                            for (h = p.length; h--;)(l = p[h]) && (j = e ? T.call(f, l) : k[h]) > -1 && (f[j] = !(g[j] = l))
                        }
                    } else p = ua(p === g ? p.splice(n, p.length) : p), e ? e(null, g, p, i) : L.apply(g, p)
                })
            }

            function F(a) {
                var b, c, d, e = a.length,
                    f = r.relative[a[0].type];
                c = f || r.relative[" "];
                for (var g = f ? 1 : 0, h = w(function (a) {
                        return a ===
                            b
                    }, c, true), i = w(function (a) {
                        return T.call(b, a) > -1
                    }, c, true), j = [function (a, c, d) {
                        return !f && (d || c !== J) || ((b = c).nodeType ? h(a, c, d) : i(a, c, d))
                  }]; e > g; g++)
                    if (c = r.relative[a[g].type]) j = [w(Ha(j), c)];
                    else {
                        if (c = r.filter[a[g].type].apply(null, a[g].matches), c[D]) {
                            for (d = ++g; e > d; d++)
                                if (r.relative[a[d].type]) break;
                            return Ia(g > 1 && Ha(j), g > 1 && t(a.slice(0, g - 1)).replace(P, "$1"), c, d > g && F(a.slice(g, d)), e > d && F(a = a.slice(d)), e > d && t(a))
                        }
                        j.push(c)
                    }
                return Ha(j)
            }

            function rc(a, b) {
                var c = 0,
                    d = b.length > 0,
                    e = a.length > 0,
                    f = function (f, g, h,
                        i, j) {
                        var l, k, o = [],
                            n = 0,
                            m = "0",
                            p = f && [],
                            u = null != j,
                            q = J,
                            t = f || e && r.find.TAG("*", j && g.parentNode || g),
                            yb = Y += null == q ? 1 : Math.random() || 0.1;
                        for (u && (J = g !== z && g, ta = c); null != (j = t[m]); m++) {
                            if (e && j) {
                                for (l = 0; k = a[l++];)
                                    if (k(j, g, h)) {
                                        i.push(j);
                                        break
                                    }
                                u && (Y = yb, ta = ++c)
                            }
                            d && ((j = !k && j) && n--, f && p.push(j))
                        }
                        if (n += m, d && m !== n) {
                            for (l = 0; k = b[l++];) k(p, o, g, h);
                            if (f) {
                                if (n > 0)
                                    for (; m--;) p[m] || o[m] || (o[m] = aa.call(i));
                                o = ua(o)
                            }
                            L.apply(i, o);
                            u && !f && o.length > 0 && n + b.length > 1 && s.uniqueSort(i)
                        }
                        return u && (Y = yb, J = q), p
                    };
                return d ? p(f) : f
            }

            function zb() {}
            var na, ta, r, B, Ab, Ga, E, J, ma, z, K, G, A, oa, M, I, O, D = "sizzle" + -new Date,
                y = a.document;
            d = void 0;
            e = void 0;
            f = void 0;
            g = void 0;
            h = void 0;
            i = void 0;
            j = void 0;
            o = void 0;
            l = void 0;
            var Y = 0,
                W = 0,
                Q = k(),
                R = k(),
                S = k(),
                Z = typeof b,
                U = -2147483648,
                ga = [],
                aa = ga.pop,
                L = ga.push,
                N = ga.slice,
                T = ga.indexOf || function (a) {
                    for (var b = 0, c = this.length; c > b; b++)
                        if (this[b] === a) return b;
                    return -1
                },
                ga = "(?:\\\\.|[\\w-]|[^\\x00-\\xa0])+".replace("w", "w#"),
                $ = "\\[[\\x20\\t\\r\\n\\f]*((?:\\\\.|[\\w-]|[^\\x00-\\xa0])+)[\\x20\\t\\r\\n\\f]*(?:([*^$|!~]?=)[\\x20\\t\\r\\n\\f]*(?:(['\"])((?:\\\\.|[^\\\\])*?)\\3|(" +
                ga + ")|)|)[\\x20\\t\\r\\n\\f]*\\]",
                V = ":((?:\\\\.|[\\w-]|[^\\x00-\\xa0])+)(?:\\(((['\"])((?:\\\\.|[^\\\\])*?)\\3|((?:\\\\.|[^\\\\()[\\]]|" + $.replace(3, 8) + ")*)|.*)\\)|)",
                P = RegExp("^[\\x20\\t\\r\\n\\f]+|((?:^|[^\\\\])(?:\\\\.)*)[\\x20\\t\\r\\n\\f]+$", "g"),
                ea = /^[\x20\t\r\n\f]*,[\x20\t\r\n\f]*/,
                fa = /^[\x20\t\r\n\f]*([\x20\t\r\n\f>+~])[\x20\t\r\n\f]*/,
                ha = RegExp(V),
                ia = RegExp("^" + ga + "$"),
                X = {
                    ID: /^#((?:\\.|[\w-]|[^\x00-\xa0])+)/,
                    CLASS: /^\.((?:\\.|[\w-]|[^\x00-\xa0])+)/,
                    NAME: /^\[name=['"]?((?:\\.|[\w-]|[^\x00-\xa0])+)['"]?\]/,
                    TAG: RegExp("^(" + "(?:\\\\.|[\\w-]|[^\\x00-\\xa0])+".replace("w", "w*") + ")"),
                    ATTR: RegExp("^" + $),
                    PSEUDO: RegExp("^" + V),
                    CHILD: RegExp("^:(only|first|last|nth|nth-last)-(child|of-type)(?:\\([\\x20\\t\\r\\n\\f]*(even|odd|(([+-]|)(\\d*)n|)[\\x20\\t\\r\\n\\f]*(?:([+-]|)[\\x20\\t\\r\\n\\f]*(\\d+)|))[\\x20\\t\\r\\n\\f]*\\)|)", "i"),
                    needsContext: RegExp("^[\\x20\\t\\r\\n\\f]*[>+~]|:(even|odd|eq|gt|lt|nth|first|last)(?:\\([\\x20\\t\\r\\n\\f]*((?:-\\d)?\\d*)[\\x20\\t\\r\\n\\f]*\\)|)(?=[^-]|$)", "i")
                },
                ba = /[\x20\t\r\n\f]*[+~]/,
                ja = /^[^{]+\{\s*\[native code/,
                ka = /^(?:#([\w-]+)|(\w+)|\.([\w-]+))$/,
                la = /^(?:input|select|textarea|button)$/i,
                pa = /^h\d$/i,
                qa = /'|\\/g,
                ra = /\=[\x20\t\r\n\f]*([^'"\]]*)[\x20\t\r\n\f]*\]/g,
                ca = /\\([\da-fA-F]{1,6}[\x20\t\r\n\f]?|.)/g,
                da = function (a, b) {
                    var c = "0x" + b - 65536;
                    return c !== c ? b : 0 > c ? String.fromCharCode(c + 65536) : String.fromCharCode(55296 | c >> 10, 56320 | 1023 & c)
                };
            try {
                N.call(y.documentElement.childNodes, 0)
            } catch (sa) {
                N = function (a) {
                    for (var b, c = []; b = this[a++];) c.push(b);
                    return c
                }
            }
            Ab = s.isXML = function (a) {
                return (a =
                    a && (a.ownerDocument || a).documentElement) ? "HTML" !== a.nodeName : false
            };
            ma = s.setDocument = function (a) {
                var c = a ? a.ownerDocument || a : y;
                return c !== z && 9 === c.nodeType && c.documentElement ? (z = c, K = c.documentElement, G = Ab(c), f = m(function (a) {
                    return a.appendChild(c.createComment("")), !a.getElementsByTagName("*").length
                }), g = m(function (a) {
                    a.innerHTML = "<select></select>";
                    a = typeof a.lastChild.getAttribute("multiple");
                    return "boolean" !== a && "string" !== a
                }), d = m(function (a) {
                    return a.innerHTML = "<div class='hidden e'></div><div class='hidden'></div>",
                        a.getElementsByClassName && a.getElementsByClassName("e").length ? (a.lastChild.className = "e", 2 === a.getElementsByClassName("e").length) : false
                }), h = m(function (a) {
                    a.id = D + 0;
                    a.innerHTML = "<a name='" + D + "'></a><div name='" + D + "'></div>";
                    K.insertBefore(a, K.firstChild);
                    var b = c.getElementsByName && c.getElementsByName(D).length === 2 + c.getElementsByName(D + 0).length;
                    return i = !c.getElementById(D), K.removeChild(a), b
                }), r.attrHandle = m(function (a) {
                    return a.innerHTML = "<a href='#'></a>", a.firstChild && typeof a.firstChild.getAttribute !==
                        Z && "#" === a.firstChild.getAttribute("href")
                }) ? {} : {
                    href: function (a) {
                        return a.getAttribute("href", 2)
                    },
                    type: function (a) {
                        return a.getAttribute("type")
                    }
                }, i ? (r.find.ID = function (a, b) {
                    if (typeof b.getElementById !== Z && !G) {
                        var c = b.getElementById(a);
                        return c && c.parentNode ? [c] : []
                    }
                }, r.filter.ID = function (a) {
                    var b = a.replace(ca, da);
                    return function (a) {
                        return a.getAttribute("id") === b
                    }
                }) : (r.find.ID = function (a, c) {
                    if (typeof c.getElementById !== Z && !G) {
                        var d = c.getElementById(a);
                        return d ? d.id === a || typeof d.getAttributeNode !==
                            Z && d.getAttributeNode("id").value === a ? [d] : b : []
                    }
                }, r.filter.ID = function (a) {
                    var b = a.replace(ca, da);
                    return function (a) {
                        return (a = typeof a.getAttributeNode !== Z && a.getAttributeNode("id")) && a.value === b
                    }
                }), r.find.TAG = f ? function (a, c) {
                    return typeof c.getElementsByTagName !== Z ? c.getElementsByTagName(a) : b
                } : function (a, b) {
                    var c, d = [],
                        e = 0,
                        f = b.getElementsByTagName(a);
                    if ("*" === a) {
                        for (; c = f[e++];) 1 === c.nodeType && d.push(c);
                        return d
                    }
                    return f
                }, r.find.NAME = h && function (a, c) {
                    return typeof c.getElementsByName !== Z ? c.getElementsByName(name) :
                        b
                }, r.find.CLASS = d && function (a, c) {
                    return typeof c.getElementsByClassName === Z || G ? b : c.getElementsByClassName(a)
                }, oa = [], A = [":focus"], (e = n(c.querySelectorAll)) && (m(function (a) {
                    a.innerHTML = "<select><option selected=''></option></select>";
                    a.querySelectorAll("[selected]").length || A.push("\\[[\\x20\\t\\r\\n\\f]*(?:checked|disabled|ismap|multiple|readonly|selected|value)");
                    a.querySelectorAll(":checked").length || A.push(":checked")
                }), m(function (a) {
                    a.innerHTML = "<input type='hidden' i=''/>";
                    a.querySelectorAll("[i^='']").length &&
                        A.push("[*^$]=[\\x20\\t\\r\\n\\f]*(?:\"\"|'')");
                    a.querySelectorAll(":enabled").length || A.push(":enabled", ":disabled");
                    a.querySelectorAll("*,:x");
                    A.push(",.*:")
                })), (j = n(M = K.matchesSelector || K.mozMatchesSelector || K.webkitMatchesSelector || K.oMatchesSelector || K.msMatchesSelector)) && m(function (a) {
                    o = M.call(a, "div");
                    M.call(a, "[s!='']:x");
                    oa.push("!=", V)
                }), A = RegExp(A.join("|")), oa = RegExp(oa.join("|")), I = n(K.contains) || K.compareDocumentPosition ? function (a, b) {
                    var c = 9 === a.nodeType ? a.documentElement : a,
                        d = b && b.parentNode;
                    return a === d || !(!d || 1 !== d.nodeType || !(c.contains ? c.contains(d) : a.compareDocumentPosition && 16 & a.compareDocumentPosition(d)))
                } : function (a, b) {
                    if (b)
                        for (; b = b.parentNode;)
                            if (b === a) return true;
                    return false
                }, O = K.compareDocumentPosition ? function (a, b) {
                    var d;
                    return a === b ? (E = true, 0) : (d = b.compareDocumentPosition && a.compareDocumentPosition && a.compareDocumentPosition(b)) ? 1 & d || a.parentNode && 11 === a.parentNode.nodeType ? a === c || I(y, a) ? -1 : b === c || I(y, b) ? 1 : 0 : 4 & d ? -1 : 1 : a.compareDocumentPosition ? -1 : 1
                } : function (a, b) {
                    var d,
                        e = 0;
                    d = a.parentNode;
                    var f = b.parentNode,
                        g = [a],
                        h = [b];
                    if (a === b) return E = true, 0;
                    if (!d || !f) return a === c ? -1 : b === c ? 1 : d ? -1 : f ? 1 : 0;
                    if (d === f) return q(a, b);
                    for (d = a; d = d.parentNode;) g.unshift(d);
                    for (d = b; d = d.parentNode;) h.unshift(d);
                    for (; g[e] === h[e];) e++;
                    return e ? q(g[e], h[e]) : g[e] === y ? -1 : h[e] === y ? 1 : 0
                }, E = false, [0, 0].sort(O), l = E, z) : z
            };
            s.matches = function (a, b) {
                return s(a, null, null, b)
            };
            s.matchesSelector = function (a, b) {
                if ((a.ownerDocument || a) !== z && ma(a), b = b.replace(ra, "='$1']"), !(!j || G || oa && oa.test(b) || A.test(b))) try {
                    var c =
                        M.call(a, b);
                    if (c || o || a.document && 11 !== a.document.nodeType) return c
                } catch (d) {}
                return s(b, z, null, [a]).length > 0
            };
            s.contains = function (a, b) {
                return (a.ownerDocument || a) !== z && ma(a), I(a, b)
            };
            s.attr = function (a, b) {
                var c;
                return (a.ownerDocument || a) !== z && ma(a), G || (b = b.toLowerCase()), (c = r.attrHandle[b]) ? c(a) : G || g ? a.getAttribute(b) : ((c = a.getAttributeNode(b)) || a.getAttribute(b)) && a[b] === true ? b : c && c.specified ? c.value : null
            };
            s.error = function (a) {
                throw Error("Syntax error, unrecognized expression: " + a);
            };
            s.uniqueSort = function (a) {
                var b,
                    c = [],
                    d = 1,
                    e = 0;
                if (E = !l, a.sort(O), E) {
                    for (; b = a[d]; d++) b === a[d - 1] && (e = c.push(d));
                    for (; e--;) a.splice(c[e], 1)
                }
                return a
            };
            B = s.getText = function (a) {
                var b, c = "",
                    d = 0;
                if (b = a.nodeType)
                    if (1 === b || 9 === b || 11 === b) {
                        if ("string" == typeof a.textContent) return a.textContent;
                        for (a = a.firstChild; a; a = a.nextSibling) c += B(a)
                    } else {
                        if (3 === b || 4 === b) return a.nodeValue
                    } else
                    for (; b = a[d]; d++) c += B(b);
                return c
            };
            r = s.selectors = {
                cacheLength: 50,
                createPseudo: p,
                match: X,
                find: {},
                relative: {
                    ">": {
                        dir: "parentNode",
                        first: true
                    },
                    " ": {
                        dir: "parentNode"
                    },
                    "+": {
                        dir: "previousSibling",
                        first: true
                    },
                    "~": {
                        dir: "previousSibling"
                    }
                },
                preFilter: {
                    ATTR: function (a) {
                        return a[1] = a[1].replace(ca, da), a[3] = (a[4] || a[5] || "").replace(ca, da), "~=" === a[2] && (a[3] = " " + a[3] + " "), a.slice(0, 4)
                    },
                    CHILD: function (a) {
                        return a[1] = a[1].toLowerCase(), "nth" === a[1].slice(0, 3) ? (a[3] || s.error(a[0]), a[4] = +(a[4] ? a[5] + (a[6] || 1) : 2 * ("even" === a[3] || "odd" === a[3])), a[5] = +(a[7] + a[8] || "odd" === a[3])) : a[3] && s.error(a[0]), a
                    },
                    PSEUDO: function (a) {
                        var b, c = !a[5] && a[2];
                        return X.CHILD.test(a[0]) ? null : (a[4] ? a[2] = a[4] : c && ha.test(c) && (b = x(c,
                            true)) && (b = c.indexOf(")", c.length - b) - c.length) && (a[0] = a[0].slice(0, b), a[2] = c.slice(0, b)), a.slice(0, 3))
                    }
                },
                filter: {
                    TAG: function (a) {
                        return "*" === a ? function () {
                            return true
                        } : (a = a.replace(ca, da).toLowerCase(), function (b) {
                            return b.nodeName && b.nodeName.toLowerCase() === a
                        })
                    },
                    CLASS: function (a) {
                        var b = Q[a + " "];
                        return b || (b = RegExp("(^|[\\x20\\t\\r\\n\\f])" + a + "([\\x20\\t\\r\\n\\f]|$)")) && Q(a, function (a) {
                            return b.test(a.className || typeof a.getAttribute !== Z && a.getAttribute("class") || "")
                        })
                    },
                    ATTR: function (a, b, c) {
                        return function (d) {
                            d =
                                s.attr(d, a);
                            return null == d ? "!=" === b : b ? (d += "", "=" === b ? d === c : "!=" === b ? d !== c : "^=" === b ? c && 0 === d.indexOf(c) : "*=" === b ? c && d.indexOf(c) > -1 : "$=" === b ? c && d.slice(-c.length) === c : "~=" === b ? (" " + d + " ").indexOf(c) > -1 : "|=" === b ? d === c || d.slice(0, c.length + 1) === c + "-" : false) : true
                        }
                    },
                    CHILD: function (a, b, c, d, e) {
                        var f = "nth" !== a.slice(0, 3),
                            g = "last" !== a.slice(-4),
                            h = "of-type" === b;
                        return 1 === d && 0 === e ? function (a) {
                            return !!a.parentNode
                        } : function (b, c, i) {
                            var j, l, k, o, n, m, c = f !== g ? "nextSibling" : "previousSibling",
                                p = b.parentNode,
                                u = h && b.nodeName.toLowerCase(),
                                i = !i && !h;
                            if (p) {
                                if (f) {
                                    for (; c;) {
                                        for (k = b; k = k[c];)
                                            if (h ? k.nodeName.toLowerCase() === u : 1 === k.nodeType) return false;
                                        m = c = "only" === a && !m && "nextSibling"
                                    }
                                    return true
                                }
                                if (m = [g ? p.firstChild : p.lastChild], g && i)
                                    for (l = p[D] || (p[D] = {}), j = l[a] || [], n = j[0] === Y && j[1], o = j[0] === Y && j[2], k = n && p.childNodes[n]; k = ++n && k && k[c] || (o = n = 0) || m.pop();) {
                                        if (1 === k.nodeType && ++o && k === b) {
                                            l[a] = [Y, n, o];
                                            break
                                        }
                                    } else if (i && (j = (b[D] || (b[D] = {}))[a]) && j[0] === Y) o = j[1];
                                    else
                                        for (; k = ++n && k && k[c] || (o = n = 0) || m.pop();)
                                            if ((h ? k.nodeName.toLowerCase() === u : 1 ===
                                                    k.nodeType) && ++o && (i && ((k[D] || (k[D] = {}))[a] = [Y, o]), k === b)) break;
                                return o -= e, o === d || 0 === o % d && o / d >= 0
                            }
                        }
                    },
                    PSEUDO: function (a, b) {
                        var c, d = r.pseudos[a] || r.setFilters[a.toLowerCase()] || s.error("unsupported pseudo: " + a);
                        return d[D] ? d(b) : d.length > 1 ? (c = [a, a, "", b], r.setFilters.hasOwnProperty(a.toLowerCase()) ? p(function (a, c) {
                            for (var e, f = d(a, b), g = f.length; g--;) e = T.call(a, f[g]), a[e] = !(c[e] = f[g])
                        }) : function (a) {
                            return d(a, 0, c)
                        }) : d
                    }
                },
                pseudos: {
                    not: p(function (a) {
                        var b = [],
                            c = [],
                            d = Ga(a.replace(P, "$1"));
                        return d[D] ? p(function (a,
                            b, c, e) {
                            for (var f, c = d(a, null, e, []), e = a.length; e--;)(f = c[e]) && (a[e] = !(b[e] = f))
                        }) : function (a, e, f) {
                            return b[0] = a, d(b, null, f, c), !c.pop()
                        }
                    }),
                    has: p(function (a) {
                        return function (b) {
                            return s(a, b).length > 0
                        }
                    }),
                    contains: p(function (a) {
                        return function (b) {
                            return (b.textContent || b.innerText || B(b)).indexOf(a) > -1
                        }
                    }),
                    lang: p(function (a) {
                        return ia.test(a || "") || s.error("unsupported lang: " + a), a = a.replace(ca, da).toLowerCase(),
                            function (b) {
                                var c;
                                do
                                    if (c = G ? b.getAttribute("xml:lang") || b.getAttribute("lang") : b.lang) return c = c.toLowerCase(),
                                        c === a || 0 === c.indexOf(a + "-");
                                while ((b = b.parentNode) && 1 === b.nodeType);
                                return false
                            }
                    }),
                    target: function (b) {
                        var c = a.location && a.location.hash;
                        return c && c.slice(1) === b.id
                    },
                    root: function (a) {
                        return a === K
                    },
                    focus: function (a) {
                        return a === z.activeElement && (!z.hasFocus || z.hasFocus()) && !(!a.type && !a.href && !~a.tabIndex)
                    },
                    enabled: function (a) {
                        return a.disabled === false
                    },
                    disabled: function (a) {
                        return a.disabled === true
                    },
                    checked: function (a) {
                        var b = a.nodeName.toLowerCase();
                        return "input" === b && !!a.checked || "option" === b && !!a.selected
                    },
                    selected: function (a) {
                        return a.selected === true
                    },
                    empty: function (a) {
                        for (a = a.firstChild; a; a = a.nextSibling)
                            if (a.nodeName > "@" || 3 === a.nodeType || 4 === a.nodeType) return false;
                        return true
                    },
                    parent: function (a) {
                        return !r.pseudos.empty(a)
                    },
                    header: function (a) {
                        return pa.test(a.nodeName)
                    },
                    input: function (a) {
                        return la.test(a.nodeName)
                    },
                    button: function (a) {
                        var b = a.nodeName.toLowerCase();
                        return "input" === b && "button" === a.type || "button" === b
                    },
                    text: function (a) {
                        var b;
                        return "input" === a.nodeName.toLowerCase() && "text" === a.type &&
                            (null == (b = a.getAttribute("type")) || b.toLowerCase() === a.type)
                    },
                    first: H(function () {
                        return [0]
                    }),
                    last: H(function (a, b) {
                        return [b - 1]
                    }),
                    eq: H(function (a, b, c) {
                        return [0 > c ? c + b : c]
                    }),
                    even: H(function (a, b) {
                        for (var c = 0; b > c; c += 2) a.push(c);
                        return a
                    }),
                    odd: H(function (a, b) {
                        for (var c = 1; b > c; c += 2) a.push(c);
                        return a
                    }),
                    lt: H(function (a, b, c) {
                        for (b = 0 > c ? c + b : c; --b >= 0;) a.push(b);
                        return a
                    }),
                    gt: H(function (a, b, c) {
                        for (c = 0 > c ? c + b : c; b > ++c;) a.push(c);
                        return a
                    })
                }
            };
            for (na in {
                    radio: true,
                    checkbox: true,
                    file: true,
                    password: true,
                    image: true
                }) r.pseudos[na] =
                C(na);
            for (na in {
                    submit: true,
                    reset: true
                }) r.pseudos[na] = v(na);
            Ga = s.compile = function (a, b) {
                var c, d = [],
                    e = [],
                    f = S[a + " "];
                if (!f) {
                    for (b || (b = x(a)), c = b.length; c--;) f = F(b[c]), f[D] ? d.push(f) : e.push(f);
                    f = S(a, rc(e, d))
                }
                return f
            };
            r.pseudos.nth = r.pseudos.eq;
            r.filters = zb.prototype = r.pseudos;
            r.setFilters = new zb;
            ma();
            s.attr = c.attr;
            c.find = s;
            c.expr = s.selectors;
            c.expr[":"] = c.expr.pseudos;
            c.unique = s.uniqueSort;
            c.text = s.getText;
            c.isXMLDoc = s.isXML;
            c.contains = s.contains
        })(q);
        var sc = /Until$/,
            tc = /^(?:parents|prev(?:Until|All))/,
            Tb = /^.[^:#\[\.,]*$/,
            Bb = c.expr.match.needsContext,
            uc = {
                children: true,
                contents: true,
                next: true,
                prev: true
            };
        c.fn.extend({
            find: function (a) {
                var b, d, e, f = this.length;
                if ("string" != typeof a) return e = this, this.pushStack(c(a).filter(function () {
                    for (b = 0; f > b; b++)
                        if (c.contains(e[b], this)) return true
                }));
                for (d = [], b = 0; f > b; b++) c.find(a, this[b], d);
                return d = this.pushStack(f > 1 ? c.unique(d) : d), d.selector = (this.selector ? this.selector + " " : "") + a, d
            },
            has: function (a) {
                var b, d = c(a, this),
                    e = d.length;
                return this.filter(function () {
                    for (b =
                        0; e > b; b++)
                        if (c.contains(this, d[b])) return true
                })
            },
            not: function (a) {
                return this.pushStack(Va(this, a, false))
            },
            filter: function (a) {
                return this.pushStack(Va(this, a, true))
            },
            is: function (a) {
                return !!a && ("string" == typeof a ? Bb.test(a) ? c(a, this.context).index(this[0]) >= 0 : c.filter(a, this).length > 0 : this.filter(a).length > 0)
            },
            closest: function (a, b) {
                for (var d, e = 0, f = this.length, g = [], h = Bb.test(a) || "string" != typeof a ? c(a, b || this.context) : 0; f > e; e++)
                    for (d = this[e]; d && d.ownerDocument && d !== b && 11 !== d.nodeType;) {
                        if (h ? h.index(d) >
                            -1 : c.find.matchesSelector(d, a)) {
                            g.push(d);
                            break
                        }
                        d = d.parentNode
                    }
                return this.pushStack(g.length > 1 ? c.unique(g) : g)
            },
            index: function (a) {
                return a ? "string" == typeof a ? c.inArray(this[0], c(a)) : c.inArray(a.jquery ? a[0] : a, this) : this[0] && this[0].parentNode ? this.first().prevAll().length : -1
            },
            add: function (a, b) {
                var d = "string" == typeof a ? c(a, b) : c.makeArray(a && a.nodeType ? [a] : a),
                    d = c.merge(this.get(), d);
                return this.pushStack(c.unique(d))
            },
            addBack: function (a) {
                return this.add(null == a ? this.prevObject : this.prevObject.filter(a))
            }
        });
        c.fn.andSelf = c.fn.addBack;
        c.each({
            parent: function (a) {
                return (a = a.parentNode) && 11 !== a.nodeType ? a : null
            },
            parents: function (a) {
                return c.dir(a, "parentNode")
            },
            parentsUntil: function (a, b, d) {
                return c.dir(a, "parentNode", d)
            },
            next: function (a) {
                return Ua(a, "nextSibling")
            },
            prev: function (a) {
                return Ua(a, "previousSibling")
            },
            nextAll: function (a) {
                return c.dir(a, "nextSibling")
            },
            prevAll: function (a) {
                return c.dir(a, "previousSibling")
            },
            nextUntil: function (a, b, d) {
                return c.dir(a, "nextSibling", d)
            },
            prevUntil: function (a, b, d) {
                return c.dir(a,
                    "previousSibling", d)
            },
            siblings: function (a) {
                return c.sibling((a.parentNode || {}).firstChild, a)
            },
            children: function (a) {
                return c.sibling(a.firstChild)
            },
            contents: function (a) {
                return c.nodeName(a, "iframe") ? a.contentDocument || a.contentWindow.document : c.merge([], a.childNodes)
            }
        }, function (a, b) {
            c.fn[a] = function (d, e) {
                var f = c.map(this, b, d);
                return sc.test(a) || (e = d), e && "string" == typeof e && (f = c.filter(e, f)), f = this.length > 1 && !uc[a] ? c.unique(f) : f, this.length > 1 && tc.test(a) && (f = f.reverse()), this.pushStack(f)
            }
        });
        c.extend({
            filter: function (a,
                b, d) {
                return d && (a = ":not(" + a + ")"), 1 === b.length ? c.find.matchesSelector(b[0], a) ? [b[0]] : [] : c.find.matches(a, b)
            },
            dir: function (a, b, d) {
                for (var e = [], a = a[b]; a && 9 !== a.nodeType && (d === k || 1 !== a.nodeType || !c(a).is(d));) 1 === a.nodeType && e.push(a), a = a[b];
                return e
            },
            sibling: function (a, b) {
                for (var c = []; a; a = a.nextSibling) 1 === a.nodeType && a !== b && c.push(a);
                return c
            }
        });
        var Xa = "abbr|article|aside|audio|bdi|canvas|data|datalist|details|figcaption|figure|footer|header|hgroup|mark|meter|nav|output|progress|section|summary|time|video",
            vc = / jQuery\d+="(?:null|\d+)"/g,
            Cb = RegExp("<(?:" + Xa + ")[\\s/>]", "i"),
            Ja = /^\s+/,
            Db = /<(?!area|br|col|embed|hr|img|input|link|meta|param)(([\w:]+)[^>]*)\/>/gi,
            Eb = /<([\w:]+)/,
            Fb = /<tbody/i,
            wc = /<|&#?\w+;/,
            xc = /<(?:script|style|link)/i,
            va = /^(?:checkbox|radio)$/i,
            yc = /checked\s*(?:[^=]|=\s*.checked.)/i,
            Gb = /^$|\/(?:java|ecma)script/i,
            Ub = /^true\/(.*)/,
            zc = /^\s*<!(?:\[CDATA\[|--)|(?:\]\]|--)>\s*$/g,
            x = {
                option: [1, "<select multiple='multiple'>", "</select>"],
                legend: [1, "<fieldset>", "</fieldset>"],
                area: [1, "<map>", "</map>"],
                param: [1, "<object>", "</object>"],
                thead: [1, "<table>", "</table>"],
                tr: [2, "<table><tbody>", "</tbody></table>"],
                col: [2, "<table><tbody></tbody><colgroup>", "</colgroup></table>"],
                td: [3, "<table><tbody><tr>", "</tr></tbody></table>"],
                _default: c.support.htmlSerialize ? [0, "", ""] : [1, "X<div>", "</div>"]
            },
            Ka = Wa(m).appendChild(m.createElement("div"));
        x.optgroup = x.option;
        x.tbody = x.tfoot = x.colgroup = x.caption = x.thead;
        x.th = x.td;
        c.fn.extend({
            text: function (a) {
                return c.access(this, function (a) {
                    return a === k ? c.text(this) : this.empty().append((this[0] &&
                        this[0].ownerDocument || m).createTextNode(a))
                }, null, a, arguments.length)
            },
            wrapAll: function (a) {
                if (c.isFunction(a)) return this.each(function (b) {
                    c(this).wrapAll(a.call(this, b))
                });
                if (this[0]) {
                    var b = c(a, this[0].ownerDocument).eq(0).clone(true);
                    this[0].parentNode && b.insertBefore(this[0]);
                    b.map(function () {
                        for (var a = this; a.firstChild && 1 === a.firstChild.nodeType;) a = a.firstChild;
                        return a
                    }).append(this)
                }
                return this
            },
            wrapInner: function (a) {
                return c.isFunction(a) ? this.each(function (b) {
                    c(this).wrapInner(a.call(this,
                        b))
                }) : this.each(function () {
                    var b = c(this),
                        d = b.contents();
                    d.length ? d.wrapAll(a) : b.append(a)
                })
            },
            wrap: function (a) {
                var b = c.isFunction(a);
                return this.each(function (d) {
                    c(this).wrapAll(b ? a.call(this, d) : a)
                })
            },
            unwrap: function () {
                return this.parent().each(function () {
                    c.nodeName(this, "body") || c(this).replaceWith(this.childNodes)
                }).end()
            },
            append: function () {
                return this.domManip(arguments, true, function (a) {
                    (1 === this.nodeType || 11 === this.nodeType || 9 === this.nodeType) && this.appendChild(a)
                })
            },
            prepend: function () {
                return this.domManip(arguments,
                    true,
                    function (a) {
                        (1 === this.nodeType || 11 === this.nodeType || 9 === this.nodeType) && this.insertBefore(a, this.firstChild)
                    })
            },
            before: function () {
                return this.domManip(arguments, false, function (a) {
                    this.parentNode && this.parentNode.insertBefore(a, this)
                })
            },
            after: function () {
                return this.domManip(arguments, false, function (a) {
                    this.parentNode && this.parentNode.insertBefore(a, this.nextSibling)
                })
            },
            remove: function (a, b) {
                for (var d, e = 0; null != (d = this[e]); e++)(!a || c.filter(a, [d]).length > 0) && (b || 1 !== d.nodeType || c.cleanData(C(d)),
                    d.parentNode && (b && c.contains(d.ownerDocument, d) && sa(C(d, "script")), d.parentNode.removeChild(d)));
                return this
            },
            empty: function () {
                for (var a, b = 0; null != (a = this[b]); b++) {
                    for (1 === a.nodeType && c.cleanData(C(a, false)); a.firstChild;) a.removeChild(a.firstChild);
                    a.options && c.nodeName(a, "select") && (a.options.length = 0)
                }
                return this
            },
            clone: function (a, b) {
                return a = null == a ? false : a, b = null == b ? a : b, this.map(function () {
                    return c.clone(this, a, b)
                })
            },
            html: function (a) {
                return c.access(this, function (a) {
                    var d = this[0] || {},
                        e = 0,
                        f = this.length;
                    if (a === k) return 1 === d.nodeType ? d.innerHTML.replace(vc, "") : k;
                    if (!("string" != typeof a || xc.test(a) || !c.support.htmlSerialize && Cb.test(a) || !c.support.leadingWhitespace && Ja.test(a) || x[(Eb.exec(a) || ["", ""])[1].toLowerCase()])) {
                        a = a.replace(Db, "<$1></$2>");
                        try {
                            for (; f > e; e++) d = this[e] || {}, 1 === d.nodeType && (c.cleanData(C(d, false)), d.innerHTML = a);
                            d = 0
                        } catch (g) {}
                    }
                    d && this.empty().append(a)
                }, null, a, arguments.length)
            },
            replaceWith: function (a) {
                return c.isFunction(a) || "string" == typeof a || (a = c(a).not(this).detach()), this.domManip([a],
                    true,
                    function (a) {
                        var d = this.nextSibling,
                            e = this.parentNode;
                        e && (c(this).remove(), e.insertBefore(a, d))
                    })
            },
            detach: function (a) {
                return this.remove(a, true)
            },
            domManip: function (a, b, d) {
                var a = qb.apply([], a),
                    e, f, g, h, i = 0,
                    j = this.length,
                    o = this,
                    l = j - 1,
                    n = a[0],
                    m = c.isFunction(n);
                if (m || !(1 >= j || "string" != typeof n || c.support.checkClone) && yc.test(n)) return this.each(function (c) {
                    var e = o.eq(c);
                    m && (a[0] = n.call(this, c, b ? e.html() : k));
                    e.domManip(a, b, d)
                });
                if (j && (h = c.buildFragment(a, this[0].ownerDocument, false, this), e = h.firstChild,
                        1 === h.childNodes.length && (h = e), e)) {
                    for (b = b && c.nodeName(e, "tr"), g = c.map(C(h, "script"), Ya), e = g.length; j > i; i++) f = h, i !== l && (f = c.clone(f, true, true), e && c.merge(g, C(f, "script"))), d.call(b && c.nodeName(this[i], "table") ? this[i].getElementsByTagName("tbody")[0] || this[i].appendChild(this[i].ownerDocument.createElement("tbody")) : this[i], f, i);
                    if (e)
                        for (h = g[g.length - 1].ownerDocument, c.map(g, Za), i = 0; e > i; i++) f = g[i], Gb.test(f.type || "") && !c._data(f, "globalEval") && c.contains(h, f) && (f.src ? c.ajax({
                            url: f.src,
                            type: "GET",
                            dataType: "script",
                            async: false,
                            global: false,
                            "throws": true
                        }) : c.globalEval((f.text || f.textContent || f.innerHTML || "").replace(zc, "")));
                    h = e = null
                }
                return this
            }
        });
        c.each({
            appendTo: "append",
            prependTo: "prepend",
            insertBefore: "before",
            insertAfter: "after",
            replaceAll: "replaceWith"
        }, function (a, b) {
            c.fn[a] = function (a) {
                for (var e, f = 0, g = [], a = c(a), h = a.length - 1; h >= f; f++) e = f === h ? this : this.clone(true), c(a[f])[b](e), za.apply(g, e.get());
                return this.pushStack(g)
            }
        });
        c.extend({
            clone: function (a, b, d) {
                var e, f, g, h, i, j = c.contains(a.ownerDocument,
                    a);
                if (c.support.html5Clone || c.isXMLDoc(a) || !Cb.test("<" + a.nodeName + ">") ? g = a.cloneNode(true) : (Ka.innerHTML = a.outerHTML, Ka.removeChild(g = Ka.firstChild)), !(c.support.noCloneEvent && c.support.noCloneChecked || 1 !== a.nodeType && 11 !== a.nodeType || c.isXMLDoc(a)))
                    for (e = C(g), i = C(a), h = 0; null != (f = i[h]); ++h)
                        if (e[h]) {
                            var k = e[h],
                                l = void 0,
                                n = void 0,
                                m = void 0;
                            if (1 === k.nodeType) {
                                if (l = k.nodeName.toLowerCase(), !c.support.noCloneEvent && k[c.expando]) {
                                    m = c._data(k);
                                    for (n in m.events) c.removeEvent(k, n, m.handle);
                                    k.removeAttribute(c.expando)
                                }
                                "script" ===
                                l && k.text !== f.text ? (Ya(k).text = f.text, Za(k)) : "object" === l ? (k.parentNode && (k.outerHTML = f.outerHTML), c.support.html5Clone && f.innerHTML && !c.trim(k.innerHTML) && (k.innerHTML = f.innerHTML)) : "input" === l && va.test(f.type) ? (k.defaultChecked = k.checked = f.checked, k.value !== f.value && (k.value = f.value)) : "option" === l ? k.defaultSelected = k.selected = f.defaultSelected : ("input" === l || "textarea" === l) && (k.defaultValue = f.defaultValue)
                            }
                        }
                if (b)
                    if (d)
                        for (i = i || C(a), e = e || C(g), h = 0; null != (f = i[h]); h++) $a(f, e[h]);
                    else $a(a, g);
                return e =
                    C(g, "script"), e.length > 0 && sa(e, !j && C(a, "script")), g
            },
            buildFragment: function (a, b, d, e) {
                for (var f, g, h, i, j, k, l, n = a.length, m = Wa(b), p = [], q = 0; n > q; q++)
                    if (g = a[q], g || 0 === g)
                        if ("object" === c.type(g)) c.merge(p, g.nodeType ? [g] : g);
                        else if (wc.test(g)) {
                    for (i = i || m.appendChild(b.createElement("div")), j = (Eb.exec(g) || ["", ""])[1].toLowerCase(), l = x[j] || x._default, i.innerHTML = l[1] + g.replace(Db, "<$1></$2>") + l[2], f = l[0]; f--;) i = i.lastChild;
                    if (!c.support.leadingWhitespace && Ja.test(g) && p.push(b.createTextNode(Ja.exec(g)[0])), !c.support.tbody)
                        for (g =
                            "table" !== j || Fb.test(g) ? "<table>" !== l[1] || Fb.test(g) ? 0 : i : i.firstChild, f = g && g.childNodes.length; f--;) c.nodeName(k = g.childNodes[f], "tbody") && !k.childNodes.length && g.removeChild(k);
                    for (c.merge(p, i.childNodes), i.textContent = ""; i.firstChild;) i.removeChild(i.firstChild);
                    i = m.lastChild
                } else p.push(b.createTextNode(g));
                for (i && m.removeChild(i), c.support.appendChecked || c.grep(C(p, "input"), Vb), q = 0; g = p[q++];)
                    if ((!e || -1 === c.inArray(g, e)) && (h = c.contains(g.ownerDocument, g), i = C(m.appendChild(g), "script"), h && sa(i),
                            d))
                        for (f = 0; g = i[f++];) Gb.test(g.type || "") && d.push(g);
                return m
            },
            cleanData: function (a, b) {
                for (var d, e, f, g, h = 0, i = c.expando, j = c.cache, k = c.support.deleteExpando, l = c.event.special; null != (d = a[h]); h++)
                    if ((b || c.acceptData(d)) && (f = d[i], g = f && j[f])) {
                        if (g.events)
                            for (e in g.events) l[e] ? c.event.remove(d, e) : c.removeEvent(d, e, g.handle);
                        j[f] && (delete j[f], k ? delete d[i] : typeof d.removeAttribute !== w ? d.removeAttribute(i) : d[i] = null, U.push(f))
                    }
            }
        });
        var P, y, W, La = /alpha\([^)]*\)/i,
            Ac = /opacity\s*=\s*([^)]*)/,
            Bc = /^(top|right|bottom|left)$/,
            Cc = /^(none|table(?!-c[ea]).+)/,
            Hb = /^margin/,
            Wb = RegExp("^(" + la + ")(.*)$", "i"),
            ia = RegExp("^(" + la + ")(?!px)[a-z%]+$", "i"),
            Dc = RegExp("^([+-])=(" + la + ")", "i"),
            hb = {
                BODY: "block"
            },
            Ec = {
                position: "absolute",
                visibility: "hidden",
                display: "block"
            },
            Ib = {
                letterSpacing: 0,
                fontWeight: 400
            },
            O = ["Top", "Right", "Bottom", "Left"],
            bb = ["Webkit", "O", "Moz", "ms"];
        c.fn.extend({
            css: function (a, b) {
                return c.access(this, function (a, b, f) {
                    var g, h = {},
                        i = 0;
                    if (c.isArray(b)) {
                        for (g = y(a), f = b.length; f > i; i++) h[b[i]] = c.css(a, b[i], false, g);
                        return h
                    }
                    return f !==
                        k ? c.style(a, b, f) : c.css(a, b)
                }, a, b, arguments.length > 1)
            },
            show: function () {
                return cb(this, true)
            },
            hide: function () {
                return cb(this)
            },
            toggle: function (a) {
                var b = "boolean" == typeof a;
                return this.each(function () {
                    (b ? a : V(this)) ? c(this).show(): c(this).hide()
                })
            }
        });
        c.extend({
            cssHooks: {
                opacity: {
                    get: function (a, b) {
                        if (b) {
                            var c = W(a, "opacity");
                            return "" === c ? "1" : c
                        }
                    }
                }
            },
            cssNumber: {
                columnCount: true,
                fillOpacity: true,
                fontWeight: true,
                lineHeight: true,
                opacity: true,
                orphans: true,
                widows: true,
                zIndex: true,
                zoom: true
            },
            cssProps: {
                "float": c.support.cssFloat ?
                    "cssFloat" : "styleFloat"
            },
            style: function (a, b, d, e) {
                if (a && 3 !== a.nodeType && 8 !== a.nodeType && a.style) {
                    var f, g, h, i = c.camelCase(b),
                        j = a.style;
                    if (b = c.cssProps[i] || (c.cssProps[i] = ab(j, i)), h = c.cssHooks[b] || c.cssHooks[i], d === k) return h && "get" in h && (f = h.get(a, false, e)) !== k ? f : j[b];
                    if (g = typeof d, "string" === g && (f = Dc.exec(d)) && (d = (f[1] + 1) * f[2] + parseFloat(c.css(a, b)), g = "number"), !(null == d || "number" === g && isNaN(d) || ("number" !== g || c.cssNumber[i] || (d += "px"), c.support.clearCloneStyle || "" !== d || 0 !== b.indexOf("background") ||
                            (j[b] = "inherit"), h && "set" in h && (d = h.set(a, d, e)) === k))) try {
                        j[b] = d
                    } catch (o) {}
                }
            },
            css: function (a, b, d, e) {
                var f, g, h, i = c.camelCase(b);
                return b = c.cssProps[i] || (c.cssProps[i] = ab(a.style, i)), h = c.cssHooks[b] || c.cssHooks[i], h && "get" in h && (g = h.get(a, true, d)), g === k && (g = W(a, b, e)), "normal" === g && b in Ib && (g = Ib[b]), "" === d || d ? (f = parseFloat(g), d === true || c.isNumeric(f) ? f || 0 : g) : g
            },
            swap: function (a, b, c, e) {
                var f, g = {};
                for (f in b) g[f] = a.style[f], a.style[f] = b[f];
                c = c.apply(a, e || []);
                for (f in b) a.style[f] = g[f];
                return c
            }
        });
        q.getComputedStyle ?
            (y = function (a) {
                return q.getComputedStyle(a, null)
            }, W = function (a, b, d) {
                var e, f, g, h = (d = d || y(a)) ? d.getPropertyValue(b) || d[b] : k,
                    i = a.style;
                return d && ("" !== h || c.contains(a.ownerDocument, a) || (h = c.style(a, b)), ia.test(h) && Hb.test(b) && (e = i.width, f = i.minWidth, g = i.maxWidth, i.minWidth = i.maxWidth = i.width = h, h = d.width, i.width = e, i.minWidth = f, i.maxWidth = g)), h
            }) : m.documentElement.currentStyle && (y = function (a) {
                return a.currentStyle
            }, W = function (a, b, c) {
                var e, f, g, c = (c = c || y(a)) ? c[b] : k,
                    h = a.style;
                return null == c && h && h[b] && (c =
                    h[b]), ia.test(c) && !Bc.test(b) && (e = h.left, f = a.runtimeStyle, g = f && f.left, g && (f.left = a.currentStyle.left), h.left = "fontSize" === b ? "1em" : c, c = h.pixelLeft + "px", h.left = e, g && (f.left = g)), "" === c ? "auto" : c
            });
        c.each(["height", "width"], function (a, b) {
            c.cssHooks[b] = {
                get: function (a, e, f) {
                    return e ? 0 === a.offsetWidth && Cc.test(c.css(a, "display")) ? c.swap(a, Ec, function () {
                        return gb(a, b, f)
                    }) : gb(a, b, f) : k
                },
                set: function (a, e, f) {
                    var g = f && y(a);
                    return eb(a, e, f ? fb(a, b, f, c.support.boxSizing && "border-box" === c.css(a, "boxSizing", false, g),
                        g) : 0)
                }
            }
        });
        c.support.opacity || (c.cssHooks.opacity = {
            get: function (a, b) {
                return Ac.test((b && a.currentStyle ? a.currentStyle.filter : a.style.filter) || "") ? 0.01 * parseFloat(RegExp.$1) + "" : b ? "1" : ""
            },
            set: function (a, b) {
                var d = a.style,
                    e = a.currentStyle,
                    f = c.isNumeric(b) ? "alpha(opacity=" + 100 * b + ")" : "",
                    g = e && e.filter || d.filter || "";
                d.zoom = 1;
                (b >= 1 || "" === b) && "" === c.trim(g.replace(La, "")) && d.removeAttribute && (d.removeAttribute("filter"), "" === b || e && !e.filter) || (d.filter = La.test(g) ? g.replace(La, f) : g + " " + f)
            }
        });
        c(function () {
            c.support.reliableMarginRight ||
                (c.cssHooks.marginRight = {
                    get: function (a, b) {
                        return b ? c.swap(a, {
                            display: "inline-block"
                        }, W, [a, "marginRight"]) : k
                    }
                });
            !c.support.pixelPosition && c.fn.position && c.each(["top", "left"], function (a, b) {
                c.cssHooks[b] = {
                    get: function (a, e) {
                        return e ? (e = W(a, b), ia.test(e) ? c(a).position()[b] + "px" : e) : k
                    }
                }
            })
        });
        c.expr && c.expr.filters && (c.expr.filters.hidden = function (a) {
                return 0 >= a.offsetWidth && 0 >= a.offsetHeight || !c.support.reliableHiddenOffsets && "none" === (a.style && a.style.display || c.css(a, "display"))
            }, c.expr.filters.visible =
            function (a) {
                return !c.expr.filters.hidden(a)
            });
        c.each({
            margin: "",
            padding: "",
            border: "Width"
        }, function (a, b) {
            c.cssHooks[a + b] = {
                expand: function (c) {
                    for (var e = 0, f = {}, c = "string" == typeof c ? c.split(" ") : [c]; 4 > e; e++) f[a + O[e] + b] = c[e] || c[e - 2] || c[0];
                    return f
                }
            };
            Hb.test(a) || (c.cssHooks[a + b].set = eb)
        });
        var Fc = /%20/g,
            Xb = /\[\]$/,
            Jb = /\r?\n/g,
            Gc = /^(?:submit|button|image|reset|file)$/i,
            Hc = /^(?:input|select|textarea|keygen)/i;
        c.fn.extend({
            serialize: function () {
                return c.param(this.serializeArray())
            },
            serializeArray: function () {
                return this.map(function () {
                    var a =
                        c.prop(this, "elements");
                    return a ? c.makeArray(a) : this
                }).filter(function () {
                    var a = this.type;
                    return this.name && !c(this).is(":disabled") && Hc.test(this.nodeName) && !Gc.test(a) && (this.checked || !va.test(a))
                }).map(function (a, b) {
                    var d = c(this).val();
                    return null == d ? null : c.isArray(d) ? c.map(d, function (a) {
                        return {
                            name: b.name,
                            value: a.replace(Jb, "\r\n")
                        }
                    }) : {
                        name: b.name,
                        value: d.replace(Jb, "\r\n")
                    }
                }).get()
            }
        });
        c.param = function (a, b) {
            var d, e = [],
                f = function (a, b) {
                    b = c.isFunction(b) ? b() : null == b ? "" : b;
                    e[e.length] = encodeURIComponent(a) +
                        "=" + encodeURIComponent(b)
                };
            if (b === k && (b = c.ajaxSettings && c.ajaxSettings.traditional), c.isArray(a) || a.jquery && !c.isPlainObject(a)) c.each(a, function () {
                f(this.name, this.value)
            });
            else
                for (d in a) wa(d, a[d], b, f);
            return e.join("&").replace(Fc, "+")
        };
        c.each("blur focus focusin focusout load resize scroll unload click dblclick mousedown mouseup mousemove mouseover mouseout mouseenter mouseleave change select submit keydown keypress keyup error contextmenu".split(" "), function (a, b) {
            c.fn[b] = function (a, c) {
                return arguments.length >
                    0 ? this.on(b, null, a, c) : this.trigger(b)
            }
        });
        c.fn.hover = function (a, b) {
            return this.mouseenter(a).mouseleave(b || a)
        };
        var S, I, Ma = c.now(),
            Na = /\?/,
            Ic = /#.*$/,
            Kb = /([?&])_=[^&]*/,
            Jc = /^(.*?):[ \t]*([^\r\n]*)\r?$/gm,
            Kc = /^(?:GET|HEAD)$/,
            Lc = /^\/\//,
            Lb = /^([\w.+-]+:)(?:\/\/([^\/?#:]*)(?::(\d+)|)|)/,
            Mb = c.fn.load,
            Nb = {},
            xa = {},
            Ob = "*/".concat("*");
        try {
            I = $b.href
        } catch (Qc) {
            I = m.createElement("a"), I.href = "", I = I.href
        }
        S = Lb.exec(I.toLowerCase()) || [];
        c.fn.load = function (a, b, d) {
            if ("string" != typeof a && Mb) return Mb.apply(this, arguments);
            var e, f, g, h = this,
                i = a.indexOf(" ");
            return i >= 0 && (e = a.slice(i, a.length), a = a.slice(0, i)), c.isFunction(b) ? (d = b, b = k) : b && "object" == typeof b && (g = "POST"), h.length > 0 && c.ajax({
                url: a,
                type: g,
                dataType: "html",
                data: b
            }).done(function (a) {
                f = arguments;
                h.html(e ? c("<div>").append(c.parseHTML(a)).find(e) : a)
            }).complete(d && function (a, b) {
                h.each(d, f || [a.responseText, b, a])
            }), this
        };
        c.each("ajaxStart,ajaxStop,ajaxComplete,ajaxError,ajaxSuccess,ajaxSend".split(","), function (a, b) {
            c.fn[b] = function (a) {
                return this.on(b, a)
            }
        });
        c.each(["get",
  "post"], function (a, b) {
            c[b] = function (a, e, f, g) {
                return c.isFunction(e) && (g = g || f, f = e, e = k), c.ajax({
                    url: a,
                    type: b,
                    dataType: g,
                    data: e,
                    success: f
                })
            }
        });
        c.extend({
            active: 0,
            lastModified: {},
            etag: {},
            ajaxSettings: {
                url: I,
                type: "GET",
                isLocal: /^(?:about|app|app-storage|.+-extension|file|res|widget):$/.test(S[1]),
                global: true,
                processData: true,
                async: true,
                contentType: "application/x-www-form-urlencoded; charset=UTF-8",
                accepts: {
                    "*": Ob,
                    text: "text/plain",
                    html: "text/html",
                    xml: "application/xml, text/xml",
                    json: "application/json, text/javascript"
                },
                contents: {
                    xml: /xml/,
                    html: /html/,
                    json: /json/
                },
                responseFields: {
                    xml: "responseXML",
                    text: "responseText"
                },
                converters: {
                    "* text": q.String,
                    "text html": true,
                    "text json": c.parseJSON,
                    "text xml": c.parseXML
                },
                flatOptions: {
                    url: true,
                    context: true
                }
            },
            ajaxSetup: function (a, b) {
                return b ? ya(ya(a, c.ajaxSettings), b) : ya(c.ajaxSettings, a)
            },
            ajaxPrefilter: jb(Nb),
            ajaxTransport: jb(xa),
            ajax: function (a, b) {
                function d(a, b, d, e) {
                    var f, l, x, v, r, B = b;
                    if (2 !== H) {
                        H = 2;
                        i && clearTimeout(i);
                        o = k;
                        h = e || "";
                        t.readyState = a > 0 ? 4 : 0;
                        if (d) {
                            v = n;
                            var e = t,
                                y, w, E,
                                J, I = v.contents,
                                z = v.dataTypes,
                                K = v.responseFields;
                            for (J in K) J in d && (e[K[J]] = d[J]);
                            for (;
                                "*" === z[0];) z.shift(), w === k && (w = v.mimeType || e.getResponseHeader("Content-Type"));
                            if (w)
                                for (J in I)
                                    if (I[J] && I[J].test(w)) {
                                        z.unshift(J);
                                        break
                                    }
                            if (z[0] in d) E = z[0];
                            else {
                                for (J in d) {
                                    if (!z[0] || v.converters[J + " " + z[0]]) {
                                        E = J;
                                        break
                                    }
                                    y || (y = J)
                                }
                                E = E || y
                            }
                            v = E ? (E !== z[0] && z.unshift(E), d[E]) : k
                        }
                        if (a >= 200 && 300 > a || 304 === a)
                            if (n.ifModified && (r = t.getResponseHeader("Last-Modified"), r && (c.lastModified[g] = r), r = t.getResponseHeader("etag"), r &&
                                    (c.etag[g] = r)), 204 === a) f = true, B = "nocontent";
                            else if (304 === a) f = true, B = "notmodified";
                        else {
                            var G;
                            a: {
                                d = n;
                                l = v;
                                var A, F, B = {};
                                y = 0;
                                w = d.dataTypes.slice();
                                E = w[0];
                                if (d.dataFilter && (l = d.dataFilter(l, d.dataType)), w[1])
                                    for (A in d.converters) B[A.toLowerCase()] = d.converters[A];
                                for (; r = w[++y];)
                                    if ("*" !== r) {
                                        if ("*" !== E && E !== r) {
                                            if (A = B[E + " " + r] || B["* " + r], !A)
                                                for (G in B)
                                                    if (F = G.split(" "), F[1] === r && (A = B[E + " " + F[0]] || B["* " + F[0]])) {
                                                        A === true ? A = B[G] : B[G] !== true && (r = F[0], w.splice(y--, 0, r));
                                                        break
                                                    }
                                            if (A !== true)
                                                if (A && d["throws"]) l =
                                                    A(l);
                                                else try {
                                                    l = A(l)
                                                } catch (L) {
                                                    G = {
                                                        state: "parsererror",
                                                        error: A ? L : "No conversion from " + E + " to " + r
                                                    };
                                                    break a
                                                }
                                        }
                                        E = r
                                    }
                                G = {
                                    state: "success",
                                    data: l
                                }
                            }
                            f = G;
                            B = f.state;
                            l = f.data;
                            x = f.error;
                            f = !x
                        } else x = B, (a || !B) && (B = "error", 0 > a && (a = 0));
                        t.status = a;
                        t.statusText = (b || B) + "";
                        f ? q.resolveWith(m, [l, B, t]) : q.rejectWith(m, [t, B, x]);
                        t.statusCode(C);
                        C = k;
                        j && p.trigger(f ? "ajaxSuccess" : "ajaxError", [t, n, f ? l : x]);
                        s.fireWith(m, [t, B]);
                        j && (p.trigger("ajaxComplete", [t, n]), --c.active || c.event.trigger("ajaxStop"))
                    }
                }
                "object" == typeof a && (b = a, a = k);
                b = b || {};
                var e, f, g, h, i, j, o, l, n = c.ajaxSetup({}, b),
                    m = n.context || n,
                    p = n.context && (m.nodeType || m.jquery) ? c(m) : c.event,
                    q = c.Deferred(),
                    s = c.Callbacks("once memory"),
                    C = n.statusCode || {},
                    x = {},
                    v = {},
                    H = 0,
                    y = "canceled",
                    t = {
                        readyState: 0,
                        getResponseHeader: function (a) {
                            var b;
                            if (2 === H) {
                                if (!l)
                                    for (l = {}; b = Jc.exec(h);) l[b[1].toLowerCase()] = b[2];
                                b = l[a.toLowerCase()]
                            }
                            return null == b ? null : b
                        },
                        getAllResponseHeaders: function () {
                            return 2 === H ? h : null
                        },
                        setRequestHeader: function (a, b) {
                            var c = a.toLowerCase();
                            return H || (a = v[c] = v[c] || a, x[a] =
                                b), this
                        },
                        overrideMimeType: function (a) {
                            return H || (n.mimeType = a), this
                        },
                        statusCode: function (a) {
                            var b;
                            if (a)
                                if (2 > H)
                                    for (b in a) C[b] = [C[b], a[b]];
                                else t.always(a[t.status]);
                            return this
                        },
                        abort: function (a) {
                            a = a || y;
                            return o && o.abort(a), d(0, a), this
                        }
                    };
                if (q.promise(t).complete = s.add, t.success = t.done, t.error = t.fail, n.url = ((a || n.url || I) + "").replace(Ic, "").replace(Lc, S[1] + "//"), n.type = b.method || b.type || n.method || n.type, n.dataTypes = c.trim(n.dataType || "*").toLowerCase().match(F) || [""], null == n.crossDomain && (e = Lb.exec(n.url.toLowerCase()),
                        n.crossDomain = !(!e || e[1] === S[1] && e[2] === S[2] && (e[3] || ("http:" === e[1] ? 80 : 443)) == (S[3] || ("http:" === S[1] ? 80 : 443)))), n.data && n.processData && "string" != typeof n.data && (n.data = c.param(n.data, n.traditional)), kb(Nb, n, b, t), 2 === H) return t;
                j = n.global;
                j && 0 === c.active++ && c.event.trigger("ajaxStart");
                n.type = n.type.toUpperCase();
                n.hasContent = !Kc.test(n.type);
                g = n.url;
                n.hasContent || (n.data && (g = n.url += (Na.test(g) ? "&" : "?") + n.data, delete n.data), n.cache === false && (n.url = Kb.test(g) ? g.replace(Kb, "$1_=" + Ma++) : g + (Na.test(g) ?
                    "&" : "?") + "_=" + Ma++));
                n.ifModified && (c.lastModified[g] && t.setRequestHeader("If-Modified-Since", c.lastModified[g]), c.etag[g] && t.setRequestHeader("If-None-Match", c.etag[g]));
                (n.data && n.hasContent && n.contentType !== false || b.contentType) && t.setRequestHeader("Content-Type", n.contentType);
                t.setRequestHeader("Accept", n.dataTypes[0] && n.accepts[n.dataTypes[0]] ? n.accepts[n.dataTypes[0]] + ("*" !== n.dataTypes[0] ? ", " + Ob + "; q=0.01" : "") : n.accepts["*"]);
                for (f in n.headers) t.setRequestHeader(f, n.headers[f]);
                if (n.beforeSend &&
                    (n.beforeSend.call(m, t, n) === false || 2 === H)) return t.abort();
                y = "abort";
                for (f in {
                        success: 1,
                        error: 1,
                        complete: 1
                    }) t[f](n[f]);
                if (o = kb(xa, n, b, t)) {
                    t.readyState = 1;
                    j && p.trigger("ajaxSend", [t, n]);
                    n.async && n.timeout > 0 && (i = setTimeout(function () {
                        t.abort("timeout")
                    }, n.timeout));
                    try {
                        H = 1, o.send(x, d)
                    } catch (w) {
                        if (!(2 > H)) throw w;
                        d(-1, w)
                    }
                } else d(-1, "No Transport");
                return t
            },
            getScript: function (a, b) {
                return c.get(a, k, b, "script")
            },
            getJSON: function (a, b, d) {
                return c.get(a, b, d, "json")
            }
        });
        c.ajaxSetup({
            accepts: {
                script: "text/javascript, application/javascript, application/ecmascript, application/x-ecmascript"
            },
            contents: {
                script: /(?:java|ecma)script/
            },
            converters: {
                "text script": function (a) {
                    return c.globalEval(a), a
                }
            }
        });
        c.ajaxPrefilter("script", function (a) {
            a.cache === k && (a.cache = false);
            a.crossDomain && (a.type = "GET", a.global = false)
        });
        c.ajaxTransport("script", function (a) {
            if (a.crossDomain) {
                var b, d = m.head || c("head")[0] || m.documentElement;
                return {
                    send: function (c, f) {
                        b = m.createElement("script");
                        b.async = true;
                        a.scriptCharset && (b.charset = a.scriptCharset);
                        b.src = a.url;
                        b.onload = b.onreadystatechange = function (a, c) {
                            (c || !b.readyState ||
                                /loaded|complete/.test(b.readyState)) && (b.onload = b.onreadystatechange = null, b.parentNode && b.parentNode.removeChild(b), b = null, c || f(200, "success"))
                        };
                        d.insertBefore(b, d.firstChild)
                    },
                    abort: function () {
                        b && b.onload(k, true)
                    }
                }
            }
        });
        var Pb = [],
            Oa = /(=)\?(?=&|$)|\?\?/;
        c.ajaxSetup({
            jsonp: "callback",
            jsonpCallback: function () {
                var a = Pb.pop() || c.expando + "_" + Ma++;
                return this[a] = true, a
            }
        });
        c.ajaxPrefilter("json jsonp", function (a, b, d) {
            var e, f, g, h = a.jsonp !== false && (Oa.test(a.url) ? "url" : "string" == typeof a.data && !(a.contentType ||
                "").indexOf("application/x-www-form-urlencoded") && Oa.test(a.data) && "data");
            return h || "jsonp" === a.dataTypes[0] ? (e = a.jsonpCallback = c.isFunction(a.jsonpCallback) ? a.jsonpCallback() : a.jsonpCallback, h ? a[h] = a[h].replace(Oa, "$1" + e) : a.jsonp !== false && (a.url += (Na.test(a.url) ? "&" : "?") + a.jsonp + "=" + e), a.converters["script json"] = function () {
                return g || c.error(e + " was not called"), g[0]
            }, a.dataTypes[0] = "json", f = q[e], q[e] = function () {
                g = arguments
            }, d.always(function () {
                q[e] = f;
                a[e] && (a.jsonpCallback = b.jsonpCallback, Pb.push(e));
                g && c.isFunction(f) && f(g[0]);
                g = f = k
            }), "script") : k
        });
        var T, $, Mc = 0,
            Pa = q.ActiveXObject && function () {
                for (var a in T) T[a](k, true)
            };
        c.ajaxSettings.xhr = q.ActiveXObject ? function () {
            var a;
            if (!(a = !this.isLocal && lb())) a: {
                try {
                    a = new q.ActiveXObject("Microsoft.XMLHTTP");
                    break a
                } catch (b) {}
                a = void 0
            }
            return a
        } : lb;
        $ = c.ajaxSettings.xhr();
        c.support.cors = !!$ && "withCredentials" in $;
        $ = c.support.ajax = !!$;
        $ && c.ajaxTransport(function (a) {
            if (!a.crossDomain || c.support.cors) {
                var b;
                return {
                    send: function (d, e) {
                        var f, g, h = a.xhr();
                        if (a.username ?
                            h.open(a.type, a.url, a.async, a.username, a.password) : h.open(a.type, a.url, a.async), a.xhrFields)
                            for (g in a.xhrFields) h[g] = a.xhrFields[g];
                        a.mimeType && h.overrideMimeType && h.overrideMimeType(a.mimeType);
                        a.crossDomain || d["X-Requested-With"] || (d["X-Requested-With"] = "XMLHttpRequest");
                        try {
                            for (g in d) h.setRequestHeader(g, d[g])
                        } catch (i) {}
                        h.send(a.hasContent && a.data || null);
                        b = function (d, g) {
                            var i, n, m, p;
                            try {
                                if (b && (g || 4 === h.readyState))
                                    if (b = k, f && (h.onreadystatechange = c.noop, Pa && delete T[f]), g) 4 !== h.readyState && h.abort();
                                    else {
                                        p = {};
                                        i = h.status;
                                        n = h.getAllResponseHeaders();
                                        "string" == typeof h.responseText && (p.text = h.responseText);
                                        try {
                                            m = h.statusText
                                        } catch (q) {
                                            m = ""
                                        }
                                        i || !a.isLocal || a.crossDomain ? 1223 === i && (i = 204) : i = p.text ? 200 : 404
                                    }
                            } catch (s) {
                                g || e(-1, s)
                            }
                            p && e(i, m, p, n)
                        };
                        a.async ? 4 === h.readyState ? setTimeout(b) : (f = ++Mc, Pa && (T || (T = {}, c(q).unload(Pa)), T[f] = b), h.onreadystatechange = b) : b()
                    },
                    abort: function () {
                        b && b(k, true)
                    }
                }
            }
        });
        var L, pa, Nc = /^(?:toggle|show|hide)$/,
            Oc = RegExp("^(?:([+-])=|)(" + la + ")([a-z%]*)$", "i"),
            Pc = /queueHooks$/,
            X = [function (a,
                b, d) {
                var e, f, g, h, i, j, k, l, n = this,
                    m = a.style,
                    p = {},
                    q = [],
                    s = a.nodeType && V(a);
                d.queue || (k = c._queueHooks(a, "fx"), null == k.unqueued && (k.unqueued = 0, l = k.empty.fire, k.empty.fire = function () {
                    k.unqueued || l()
                }), k.unqueued++, n.always(function () {
                    n.always(function () {
                        k.unqueued--;
                        c.queue(a, "fx").length || k.empty.fire()
                    })
                }));
                1 === a.nodeType && ("height" in b || "width" in b) && (d.overflow = [m.overflow, m.overflowX, m.overflowY], "inline" === c.css(a, "display") && "none" === c.css(a, "float") && (c.support.inlineBlockNeedsLayout && "inline" !==
                    db(a.nodeName) ? m.zoom = 1 : m.display = "inline-block"));
                d.overflow && (m.overflow = "hidden", c.support.shrinkWrapBlocks || n.always(function () {
                    m.overflow = d.overflow[0];
                    m.overflowX = d.overflow[1];
                    m.overflowY = d.overflow[2]
                }));
                for (f in b)
                    if (g = b[f], Nc.exec(g))(delete b[f], i = i || "toggle" === g, g === (s ? "hide" : "show")) || q.push(f);
                if (b = q.length) {
                    h = c._data(a, "fxshow") || c._data(a, "fxshow", {});
                    "hidden" in h && (s = h.hidden);
                    i && (h.hidden = !s);
                    s ? c(a).show() : n.done(function () {
                        c(a).hide()
                    });
                    n.done(function () {
                        var b;
                        c._removeData(a, "fxshow");
                        for (b in p) c.style(a, b, p[b])
                    });
                    for (f = 0; b > f; f++) e = q[f], j = n.createTween(e, s ? h[e] : 0), p[e] = h[e] || c.style(a, e), e in h || (h[e] = j.start, s && (j.end = j.start, j.start = "width" === e || "height" === e ? 1 : 0))
                }
          }],
            ea = {
                "*": [function (a, b) {
                    var d, e, f = this.createTween(a, b),
                        g = Oc.exec(b),
                        h = f.cur(),
                        i = +h || 0,
                        j = 1,
                        k = 20;
                    if (g) {
                        if (d = +g[2], e = g[3] || (c.cssNumber[a] ? "" : "px"), "px" !== e && i) {
                            i = c.css(f.elem, a, true) || d || 1;
                            do j = j || ".5", i /= j, c.style(f.elem, a, i + e); while (j !== (j = f.cur() / h) && 1 !== j && --k)
                        }
                        f.unit = e;
                        f.start = i;
                        f.end = g[1] ? i + (g[1] + 1) * d : d
                    }
                    return f
              }]
            };
        c.Animation = c.extend(nb, {
            tweener: function (a, b) {
                c.isFunction(a) ? (b = a, a = ["*"]) : a = a.split(" ");
                for (var d, e = 0, f = a.length; f > e; e++) d = a[e], ea[d] = ea[d] || [], ea[d].unshift(b)
            },
            prefilter: function (a, b) {
                b ? X.unshift(a) : X.push(a)
            }
        });
        c.Tween = v;
        v.prototype = {
            constructor: v,
            init: function (a, b, d, e, f, g) {
                this.elem = a;
                this.prop = d;
                this.easing = f || "swing";
                this.options = b;
                this.start = this.now = this.cur();
                this.end = e;
                this.unit = g || (c.cssNumber[d] ? "" : "px")
            },
            cur: function () {
                var a = v.propHooks[this.prop];
                return a && a.get ? a.get(this) : v.propHooks._default.get(this)
            },
            run: function (a) {
                var b, d = v.propHooks[this.prop];
                return this.pos = b = this.options.duration ? c.easing[this.easing](a, this.options.duration * a, 0, 1, this.options.duration) : a, this.now = (this.end - this.start) * b + this.start, this.options.step && this.options.step.call(this.elem, this.now, this), d && d.set ? d.set(this) : v.propHooks._default.set(this), this
            }
        };
        v.prototype.init.prototype = v.prototype;
        v.propHooks = {
            _default: {
                get: function (a) {
                    var b;
                    return null == a.elem[a.prop] || a.elem.style && null != a.elem.style[a.prop] ? (b = c.css(a.elem,
                        a.prop, ""), b && "auto" !== b ? b : 0) : a.elem[a.prop]
                },
                set: function (a) {
                    c.fx.step[a.prop] ? c.fx.step[a.prop](a) : a.elem.style && (null != a.elem.style[c.cssProps[a.prop]] || c.cssHooks[a.prop]) ? c.style(a.elem, a.prop, a.now + a.unit) : a.elem[a.prop] = a.now
                }
            }
        };
        v.propHooks.scrollTop = v.propHooks.scrollLeft = {
            set: function (a) {
                a.elem.nodeType && a.elem.parentNode && (a.elem[a.prop] = a.now)
            }
        };
        c.each(["toggle", "show", "hide"], function (a, b) {
            var d = c.fn[b];
            c.fn[b] = function (a, c, g) {
                return null == a || "boolean" == typeof a ? d.apply(this, arguments) :
                    this.animate(ba(b, true), a, c, g)
            }
        });
        c.fn.extend({
            fadeTo: function (a, b, c, e) {
                return this.filter(V).css("opacity", 0).show().end().animate({
                    opacity: b
                }, a, c, e)
            },
            animate: function (a, b, d, e) {
                var f = c.isEmptyObject(a),
                    g = c.speed(b, d, e),
                    h = function () {
                        var b = nb(this, c.extend({}, a), g);
                        h.finish = function () {
                            b.stop(true)
                        };
                        (f || c._data(this, "finish")) && b.stop(true)
                    };
                return h.finish = h, f || g.queue === false ? this.each(h) : this.queue(g.queue, h)
            },
            stop: function (a, b, d) {
                var e = function (a) {
                    var b = a.stop;
                    delete a.stop;
                    b(d)
                };
                return "string" !=
                    typeof a && (d = b, b = a, a = k), b && a !== false && this.queue(a || "fx", []), this.each(function () {
                        var b = true,
                            g = null != a && a + "queueHooks",
                            h = c.timers,
                            i = c._data(this);
                        if (g) i[g] && i[g].stop && e(i[g]);
                        else
                            for (g in i) i[g] && i[g].stop && Pc.test(g) && e(i[g]);
                        for (g = h.length; g--;) h[g].elem !== this || null != a && h[g].queue !== a || (h[g].anim.stop(d), b = false, h.splice(g, 1));
                        (b || !d) && c.dequeue(this, a)
                    })
            },
            finish: function (a) {
                return a !== false && (a = a || "fx"), this.each(function () {
                    var b, d = c._data(this),
                        e = d[a + "queue"];
                    b = d[a + "queueHooks"];
                    var f = c.timers,
                        g = e ? e.length : 0;
                    for (d.finish = true, c.queue(this, a, []), b && b.cur && b.cur.finish && b.cur.finish.call(this), b = f.length; b--;) f[b].elem === this && f[b].queue === a && (f[b].anim.stop(true), f.splice(b, 1));
                    for (b = 0; g > b; b++) e[b] && e[b].finish && e[b].finish.call(this);
                    delete d.finish
                })
            }
        });
        c.each({
            slideDown: ba("show"),
            slideUp: ba("hide"),
            slideToggle: ba("toggle"),
            fadeIn: {
                opacity: "show"
            },
            fadeOut: {
                opacity: "hide"
            },
            fadeToggle: {
                opacity: "toggle"
            }
        }, function (a, b) {
            c.fn[a] = function (a, c, f) {
                return this.animate(b, a, c, f)
            }
        });
        c.speed = function (a,
            b, d) {
            var e = a && "object" == typeof a ? c.extend({}, a) : {
                complete: d || !d && b || c.isFunction(a) && a,
                duration: a,
                easing: d && b || b && !c.isFunction(b) && b
            };
            return e.duration = c.fx.off ? 0 : "number" == typeof e.duration ? e.duration : e.duration in c.fx.speeds ? c.fx.speeds[e.duration] : c.fx.speeds._default, (null == e.queue || e.queue === true) && (e.queue = "fx"), e.old = e.complete, e.complete = function () {
                c.isFunction(e.old) && e.old.call(this);
                e.queue && c.dequeue(this, e.queue)
            }, e
        };
        c.easing = {
            linear: function (a) {
                return a
            },
            swing: function (a) {
                return 0.5 -
                    Math.cos(a * Math.PI) / 2
            }
        };
        c.timers = [];
        c.fx = v.prototype.init;
        c.fx.tick = function () {
            var a, b = c.timers,
                d = 0;
            for (L = c.now(); b.length > d; d++) a = b[d], a() || b[d] !== a || b.splice(d--, 1);
            b.length || c.fx.stop();
            L = k
        };
        c.fx.timer = function (a) {
            a() && c.timers.push(a) && c.fx.start()
        };
        c.fx.interval = 13;
        c.fx.start = function () {
            pa || (pa = setInterval(c.fx.tick, c.fx.interval))
        };
        c.fx.stop = function () {
            clearInterval(pa);
            pa = null
        };
        c.fx.speeds = {
            slow: 600,
            fast: 200,
            _default: 400
        };
        c.fx.step = {};
        c.expr && c.expr.filters && (c.expr.filters.animated = function (a) {
            return c.grep(c.timers,
                function (b) {
                    return a === b.elem
                }).length
        });
        c.fn.offset = function (a) {
            if (arguments.length) return a === k ? this : this.each(function (b) {
                c.offset.setOffset(this, a, b)
            });
            var b, d, e = {
                    top: 0,
                    left: 0
                },
                f = this[0],
                g = f && f.ownerDocument;
            if (g) return b = g.documentElement, c.contains(b, f) ? (typeof f.getBoundingClientRect !== w && (e = f.getBoundingClientRect()), d = ob(g), {
                top: e.top + (d.pageYOffset || b.scrollTop) - (b.clientTop || 0),
                left: e.left + (d.pageXOffset || b.scrollLeft) - (b.clientLeft || 0)
            }) : e
        };
        c.offset = {
            setOffset: function (a, b, d) {
                var e = c.css(a,
                    "position");
                "static" === e && (a.style.position = "relative");
                var f = c(a),
                    g = f.offset(),
                    h = c.css(a, "top"),
                    i = c.css(a, "left"),
                    j = {},
                    k = {},
                    l, m;
                ("absolute" === e || "fixed" === e) && c.inArray("auto", [h, i]) > -1 ? (k = f.position(), l = k.top, m = k.left) : (l = parseFloat(h) || 0, m = parseFloat(i) || 0);
                c.isFunction(b) && (b = b.call(a, d, g));
                null != b.top && (j.top = b.top - g.top + l);
                null != b.left && (j.left = b.left - g.left + m);
                "using" in b ? b.using.call(a, j) : f.css(j)
            }
        };
        c.fn.extend({
            position: function () {
                if (this[0]) {
                    var a, b, d = {
                            top: 0,
                            left: 0
                        },
                        e = this[0];
                    return "fixed" ===
                        c.css(e, "position") ? b = e.getBoundingClientRect() : (a = this.offsetParent(), b = this.offset(), c.nodeName(a[0], "html") || (d = a.offset()), d.top += c.css(a[0], "borderTopWidth", true), d.left += c.css(a[0], "borderLeftWidth", true)), {
                            top: b.top - d.top - c.css(e, "marginTop", true),
                            left: b.left - d.left - c.css(e, "marginLeft", true)
                        }
                }
            },
            offsetParent: function () {
                return this.map(function () {
                    for (var a = this.offsetParent || m.documentElement; a && !c.nodeName(a, "html") && "static" === c.css(a, "position");) a = a.offsetParent;
                    return a || m.documentElement
                })
            }
        });
        c.each({
            scrollLeft: "pageXOffset",
            scrollTop: "pageYOffset"
        }, function (a, b) {
            var d = /Y/.test(b);
            c.fn[a] = function (e) {
                return c.access(this, function (a, e, h) {
                    var i = ob(a);
                    return h === k ? i ? b in i ? i[b] : i.document.documentElement[e] : a[e] : (i ? i.scrollTo(d ? c(i).scrollLeft() : h, d ? h : c(i).scrollTop()) : a[e] = h, k)
                }, a, e, arguments.length, null)
            }
        });
        c.each({
            Height: "height",
            Width: "width"
        }, function (a, b) {
            c.each({
                padding: "inner" + a,
                content: b,
                "": "outer" + a
            }, function (d, e) {
                c.fn[e] = function (e, g) {
                    var h = arguments.length && (d || "boolean" != typeof e),
                        i = d || (e === true || g === true ? "margin" : "border");
                    return c.access(this, function (b, d, e) {
                        var f;
                        return c.isWindow(b) ? b.document.documentElement["client" + a] : 9 === b.nodeType ? (f = b.documentElement, Math.max(b.body["scroll" + a], f["scroll" + a], b.body["offset" + a], f["offset" + a], f["client" + a])) : e === k ? c.css(b, d, i) : c.style(b, d, e, i)
                    }, b, h ? e : k, h, null)
                }
            })
        });
        q.jQuery = q.$ = c;
        "function" == typeof define && define.amd && define.amd.jQuery && define("jquery", [], function () {
            return c
        })
    })(window);
    return jQuery;
});

require('badjs');
BJ_REPORT.init({
    id: 25
});
BJ_REPORT.tryJs().spyAll();