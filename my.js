var define;

(function(global) {
    if (define) return;
    var head = document.getElementsByTagName('head')[0];

    // 缓存已加载的script url
    var scriptsMap = {};
    // 缓存已定义的模块函数
    var factoryMap = {};
    // 缓存模块的依赖
    var depsMap = {};
    // 缓存已初始化的模块
    var modulesMap = {};
    // 异步资源表
    var resMap = {};
    var pkgMap = {};

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

    // 格式化模块id，返回绝对路径的id
    var formatID = function(id, root) {
        id = id.replace(/\.js$/i, '');
        // ./ 和 ../
        if (root && /^\.{1,2}\//.test(id)) {
            return relativeID(id, root);
        } else {
            return id;
        }
    };

    // 获取相对路径的id
    var relativeID = function(id, rootID) {
        if (!rootID) return id;
        var items = (rootID + '/../' + id).split('/'),
            i = -1;
        while (i++ < items.length) {
            if (items[i] === '..') {
                i = i - items.splice(i - 1, 2).length;
            } else if (items[i] === '.') {
                i = i - items.splice(i, 1).length;
            }
        }
        return items.join('/');
    };

    // 获取资源的url
    var findUrl = function(id, rootID) {
        if (rootID) id = formatID(id, rootID);

        var res = resMap[id] || resMap[id + '.js'] || {};
        if (typeof res === 'string') return res;
        if (res.pkg) return res.pkg.url;
        if (res.url) return res.url;

        return relativeID(id, require.baseUrl) + '.js';
    };

    // define内部的require，会处理相对路径
    var createRequire = function(root) {
        var _require = function(id, onload) {
            if (typeof id === 'string' && !onload) {
                return require(formatID(id, root));
            } else {
                return _require.async.apply(global, arguments);
            }
        };
        // for (var key in require) {
        //     _require[key] = require[key];
        // }
        _require.async = function(ids, onload) {
            if (typeof ids === 'string') ids = [ids];
            for (var i = 0; i < ids.length; i++) {
                ids[i] = formatID(ids[i], root);
            }
            return require.async(ids, onload);
        };
        return _require;
    };

    // 定义模块
    define = function(id, deps, factory) {
        id = formatID(id);
        if (!factory) {
            factory = deps;
            deps = ['require', 'module', 'exports'];
        };
        factoryMap[id] = factory;
        depsMap[id] = deps;
    };

    // 加载一个模块
    require = function(id, onload) {
        // id是数组，或者传入onload
        if ((id && id.splice) || onload) {
            return require.async.apply(global, arguments);
        }
        var mod = modulesMap[id];
        if (mod) return mod.exports;
        // 初始化模块
        var factory = factoryMap[id];
        if (!factory) {
            console && console.log && console.log('[ModJS] Cannot find module `' + id + '`');
            return null;
        }
        mod = modulesMap[id] = {
            exports: {}
        };
        var ret;
        if (typeof factory === 'function') {
            ret = factory.apply(mod, [createRequire(id), mod.exports, mod]);
        } else {
            ret = factory;
        }
        if (ret) mod.exports = ret;
        return mod.exports;
    };

    require.async = function(ids, onload) {
        if (typeof ids === 'string') ids = [ids];
        var remain = ids.length,
            num = -1,
            args = [],
            next = function() {
                var id, mod, url;
                num++;
                remain--;
                if (remain < 0) {
                    onload && onload.apply(global, args);
                    return;
                }
                id = ids[num];
                mod = require(id);
                if (mod) {
                    args[num] = mod;
                    next();
                } else {
                    url = findUrl(id);
                    console.log(url, 123);
                    (function(num) {
                        require.loadJs(url, function() {
                            args[num] = require(id);
                            // 按顺序加载
                            require.series && next();
                        });
                    })(num);
                    // 并发加载
                    if (!require.series) next();
                }
            }
        next();
    };

    // 加载js
    require.loadJs = function(url, onload, onerror) {
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
    // 加载css
    require.loadCss = function(cfg) {
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
    require.resourceMap = function(obj) {
        var k;
        for (k in obj.res) {
            if (obj.res.hasOwnProperty(k)) resMap[k] = obj.res[k];
        }
        for (k in obj.pkg) {
            if (obj.pkg.hasOwnProperty(k)) pkgMap[k] = obj.pkg[k];
        }
    };

    // 按顺序加载异步模块
    require.series = true;
    // 超时设置
    require.timeout = 5000;
    // 主目录
    require.baseUrl = '/';

    define.amd = true;

})(this);