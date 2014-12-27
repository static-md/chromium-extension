window.addEvent('domready',function(){
    new (function(){
        /* properties */
        {
            this.$visible = $('capture-visible');
            this.$entire  = $('capture-entire');

            this.tabId = 0;

            this.bgIsBusy = false;

            /** Listen when bg will respond if it is busy or not */
            this.busyResponseListener = function(){};
        }

        /* methods */
        {
            this.sendMessage = function (r) {
                chrome.extension.sendMessage(r);
            };

            this.urlIsAllowed = function (url) {
                return /^(http|https|file|ftp|view-source)/.test(url);
            };

            /**
             * @param {boolean} [busy=true]
             */
            this.toggleBusy = function (busy) {
                if (typeof busy == 'undefined') {
                    busy = true;
                }

                $(document.body)[busy ? 'addClass' : 'removeClass']('busy');
            };

            /**
             *
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

            this.handleClick = function(mode)
            {
                this.toggleBusy(false);

                this.askBgIfBusy(function(){
                    if (this.bgIsBusy) {
                        this['$'+mode].setStyle('background-color', '#EBBBB8');
                        setTimeout(function(){
                            that['$'+mode].setStyle('background-color', '');
                        }, 300);
                        return;
                    }

                    this.toggleBusy();

                    switch (mode) {
                        case 'visible':
                            this.sendMessage({
                                cmd: 'bg:capture:visible'
                            });
                            break;
                        case 'entire':
                            this.sendMessage({
                                cmd: 'bg:capture:entire',
                                tid: this.tabId
                            });
                            break;
                        default:
                            alert('Invalid mode: '+ mode);
                    }
                });
            };
        }

        var that = this;

        /* execution */
        {
            chrome.windows.getCurrent(function(window) {
                chrome.tabs.getSelected(window.id, function(tab) {
                    that.tabId = tab.id;

                    var urlAllowed = that.urlIsAllowed(tab.url);
                    var visibleAllowed = urlAllowed,
                        entireAllowed  = urlAllowed;

                    if ((/https:\/\/chrome.google.com\//i).test(tab.url) || (/^(view-source)/).test(tab.url)) {
                        entireAllowed = false;
                    }

                    {
                        if (visibleAllowed) {
                            that.$visible.addEvent('click', function(){
                                that.handleClick('visible');
                            });
                        } else {
                            that.$visible.addClass('disabled');
                        }

                        if (entireAllowed) {
                            that.$entire.addEvent('click', function(){
                                that.handleClick('entire');
                            });
                        } else {
                            that.$entire.addClass('disabled');
                        }
                    }
                });
            });

            chrome.extension.onMessage.addListener(function(m, sender, sendResponse) {
                switch (m.cmd) {
                    case 'all:bgBusyResponse':
                        that.bgIsBusy = m.busy;
                        that.busyResponseListener();
                        that.busyResponseListener = function(){};
                        break;
                }
            });
        }
    })();
});
