(function(){
    // prevent multiple run/instances
    if (typeof window._static_md_extension_script_executed == 'undefined') {
        window._static_md_extension_script_executed = true;
    } else {
        return;
    }

    new (function()
    {
        /* properties */
        {
            /** if current script is busy */
            this.isBusy = false;

            /** if background script is busy */
            this.bgIsBusy = false;

            /** Listen when bg will respond if it is busy or not */
            this.busyResponseListener = function(){};

            this.initial = {
                scrollLeft: 0,
                scrollTop: 0
            };
            this.nextScrollTop = 0;

            this.fixedElements = [];
            
            this.emergencyScrollTimeoutId = 0;
            
            this.scrollTimeout = 200;
        }

        /* methods */
        {
            /** send message to background script */
            this.sendMessage = function(m)
            {
                chrome.runtime.sendMessage(null, m);
            };

            /**
             * @param {function} [callback]
             */
            this.askBgIfBusy = function(callback)
            {
                if (typeof callback != 'function') {
                    this.busyResponseListener = function(){};
                } else {
                    this.busyResponseListener = callback;
                }

                this.sendMessage({
                    cmd: 'bg:AreYouBusy?'
                });
            };

            this.getViewportSize = function()
            {
                var w = window,
                    d = document,
                    e = d.documentElement,
                    g = d.getElementsByTagName('body')[0],
                    x = w.innerWidth || e.clientWidth || g.clientWidth,
                    y = w.innerHeight|| e.clientHeight|| g.clientHeight;

                return {
                    x: x,
                    y: y
                };
            };

            this.getWindowHeight = function()
            {
                var body = document.body,
                    html = document.documentElement;

                return Math.max(
                    body.scrollHeight,
                    body.offsetHeight,
                    html.clientHeight,
                    html.scrollHeight,
                    html.offsetHeight
                );
            };

            this.getScroll = function()
            {
                var doc = document.documentElement, body = document.body;
                var left = (doc && doc.scrollLeft || body && body.scrollLeft || 0);
                var top = (doc && doc.scrollTop  || body && body.scrollTop  || 0);

                return {
                    left: left,
                    top: top
                };
            };

            this.cmd_captureEntire_begin = function()
            {
                var scroll = this.getScroll();

                // save for later restore
                this.initial.scrollLeft = scroll.left;
                this.initial.scrollTop = scroll.top;

                this.nextScrollTop = 0;

                this.captureNextViewPort();
            };

            this.scrollEnded = function()
            {
                var vieportSize = this.getViewportSize();
                var docHeight   = this.getWindowHeight();
                var scroll      = this.getScroll();

                this.nextScrollTop += vieportSize.y - (vieportSize.y > 20 ? 20 : 0);

                this.sendMessage({
                    cmd: 'bg:tab:capture:entire:progress',
                    page: {
                        vieportSize: vieportSize,
                        docHeight: docHeight,
                        scroll: scroll
                    }
                });
            };

            this.captureNextViewPort = function()
            {
                clearTimeout(this.emergencyScrollTimeoutId);
                
                if (this.nextScrollTop > 0) {
                    if (this.fixedElements.length == 0) {
                        // fix only on second frame (in WP the top black bar chages position after fix and covers elements below it)
                        this.enableFixedPosition(false);
                    }

                    window.onscroll = function(){                    
                        // remove listener
                        window.onscroll = function(){};
                        
                        clearTimeout(that.emergencyScrollTimeoutId);
                        
                        setTimeout(function(){
                            that.scrollEnded();
                        }, that.scrollTimeout);
                    };
                }

                window.scrollTo(this.initial.scrollLeft, this.nextScrollTop);

                if (this.nextScrollTop == 0 && this.getScroll().top == 0) {
                    clearTimeout(this.emergencyScrollTimeoutId);
                    
                    setTimeout(function(){
                        that.scrollEnded();
                    }, this.scrollTimeout);
                    
                    return;
                }
                
                // set emergency late timeout in case if scroll ended in onscroll will not be triggered anymore
                this.emergencyScrollTimeoutId = setTimeout(function(){
                    // remove listener
                    window.onscroll = function(){};
                    
                    that.scrollEnded();
                }, this.scrollTimeout * 10);
            };

            this.cmd_captureEntire_continue = function()
            {
                this.captureNextViewPort();
            };

            this.cmd_captureEntire_stop = function()
            {
                this.restoreFixedElements();

                // restore
                window.scrollTo(this.initial.scrollLeft, this.initial.scrollTop);
            };

            /**-- deal with fixed elements --**/
            // Copyright (c) 2010 The Chromium Authors. All rights reserved.
            // Use of this source code is governed by a BSD-style license that can be
            // found in the LICENSE file.
            // http://code.google.com/p/chrome-screen-capture/
            this.enableFixedPosition = function(enableFlag)
            {
                if (enableFlag) {
                    for (var i = 0, l = this.fixedElements.length; i < l; ++i) {
                        this.fixedElements[i].style.position = "fixed";
                    }
                } else {
                    var nodeIterator = document.createNodeIterator(
                        document.documentElement,
                        NodeFilter.SHOW_ELEMENT,
                        null,
                        false
                    );
                    var currentNode;
                    while (currentNode = nodeIterator.nextNode()) {
                        var nodeComputedStyle = document.defaultView.getComputedStyle(currentNode, "");
                        // Skip nodes which don't have computeStyle or are invisible.
                        if (!nodeComputedStyle)
                            return;
                        var nodePosition = nodeComputedStyle.getPropertyValue("position");
                        if (nodePosition == "fixed") {
                            this.fixedElements.push(currentNode);
                            currentNode.style.position = "absolute";
                        }
                    }
                }
            };

            this.restoreFixedElements = function()
            {
                if (this.fixedElements) {
                    for (var i=0, len=this.fixedElements.length; i<len; i++) {
                        this.fixedElements[i].style.position = 'fixed';
                    }

                    this.fixedElements = []; // empty
                }
            };
        }

        var that = this;

        /* execute */
        (function(){
            chrome.runtime.onMessage.addListener(function(m, sender, sendResponse){
                switch (m.cmd) {
                    case 'tab:capture:entire:begin':
                        that.cmd_captureEntire_begin();
                        break;
                    case 'tab:capture:entire:continue':
                        that.cmd_captureEntire_continue();
                        break;
                    case 'tab:capture:entire:stop':
                        that.cmd_captureEntire_stop();
                        break;
                    case 'all:bgBusyResponse':
                        that.bgIsBusy = m.busy;
                        that.busyResponseListener();
                        that.busyResponseListener = function(){};
                        break;
                }
            });
        })();
    })();
})();
