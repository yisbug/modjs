var define;

(function(global) {
    if (define) return;
    var head = document.getElementsByTagName('head')[0];

    // 缓存已加载的script url
    var scriptsMap = {};
    // 缓存已定义的模块函数 格式{deps:deps,factory:factory}
    var factoryMap = {};
    // 缓存已初始化的模块
    var modulesMap = {};
    // 异步资源表
    var resMap = {};

    // 添加一个onload事件
    var addOnLoadEvent = function(element, onload) {
        if ('onload' in element) {
            element.onload = onload;
        } else {
            element.onreadystatechange = function() {
                if (this.readyState === 'loaded' || this.readyState === 'complete') {
                    onload.call(this);
                }
            };
        }
    };
    // 加载一个script
    var createScript = function(url, onload, onerror) {
        if (url in scriptsMap) {
            if (onload) onload();
            return;
        }
        var script = document.createElement('script'),
            tid;
        scriptsMap[url] = true;
        if (onerror) {
            // 超时
            tid = setTimeout(onerror, require.timeout);
            script.onerror = function() {
                clearTimeout(tid);
                onerror.call(this);
            };
        }
        if (onload) {
            addOnLoadEvent(script, function() {
                if (tid) clearTimeout(tid);
                onload.call(this);
            });
        }
        script.type = 'text/javascript';
        script.src = url;
        head.appendChild(script);
        return script;
    };

    // 格式化模块id，返回绝对路径的id
    var formatID = function(id, root) {
        id = id.replace(/\.js$/i, '');
        // ./ 和 ../
        if (/^\.{1,2}\//.test(id)) {
            return relativeID(id, root);
        } else {
            return id;
        }
    };

    // 获取相对路径的id
    var relativeID = function(id, rootID) {
        if (!rootID) return id;
        id = rootID + '../' + id;
        var items = id.split('/');
        var result = [];
        for (var i = 0; i < items.length; i++) {
            var item = items[i];
            if (item === '..') {
                result.pop();
            } else if (item === '.') {} else {
                result.push(item);
            }
        };
        return result.join('/');
    };

    // 获取资源的url
    var findUrl = function(id, rootID) {
        if (rootID) {
            id = relativeID(id);
        }
        if (resMap[id]) {
            return resMap[id].url;
        }
        return relativeID(id, require.baseUrl);
    }

    // 定义模块
    define = function(id, deps, factory) {
        id = formatID(id);
        if (!factory) {
            factory = deps;
            deps = [];
        };
        factoryMap[id] = factory;
        deps.length && require.async(deps, function() {});
    };

    // define内部的require
    var createRequire = function(root) {
        var require = function(id, onload, onerror) {
            // id是数组，或者传入onload
            if ((id && id.splice) || onload) {
                return require.async.apply(global, arguments);
            }
            id = formatID(id, root);
            var mod = modulesMap[id];
            if (mod) {
                return mod.exports;
            }
            // 初始化模块
            var factory = factoryMap[id];
            if (!factory) {
                console && console.log && console.log('[ModJS] Cannot find module `' + id + '`');
                return null;
            }
            mod = modulesMap[id] = {
                exports: {}
            };

            // function or value
            var ret;
            if (typeof factory === 'function') {
                ret = factory.apply(mod, [require, mod.exports, mod]);
            } else {
                ret = factory;
            }
            if (ret) {
                mod.exports = ret;
            }
            return mod.exports;
        };

        require.async = function() {
            if (typeof ids === 'string') ids = [ids];
            var len = ids.length;
            var num = 0;
            var args = [];

            function next() {
                num++;
                len--;
                if (len === 0) {
                    onload && onload.apply(global, args);
                    return;
                }
                load();
            }

            function load() {
                var id = ids[num];
                var mod = require(id);
                if (mod) {
                    args[i] = mod;
                    next();
                } else {
                    var url = findUrl(id, root);
                    (function(ii){
                        createScript(url, function() {
                            args[ii] = require(id);
                            // 按顺序加载
                            require.series && next();
                        }, onerror);
                    })(num);
                    // 并发加载
                    if (!require.series) next();
                }
            }

            load(0);
        };
        return require;
    };
    global.require = createRequire('/');

    // 加载js
    global.require.loadJs = function(url, onload, onerror) {
        return createScript(url, onload, onerror);
    };
    // 加载css
    global.require.loadCss = function(cfg) {
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

    // 设置资源表
    global.require.resourceMap = function(obj) {
        for (var k in obj.res) {
            if (obj.res.hasOwnProperty(k)) {
                resMap[k] = obj.res[k];
            }
        }
    };

    // 按顺序加载异步模块
    global.require.series = true;
    // 超时设置
    global.require.timeout = 5000;
    // 主目录
    global.require.baseUrl = '/';

    define.amd = true;

})(this);