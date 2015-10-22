new (function()
{
    /* properties */
    {
        /**
         * base64 image content
         * @type string
         */
        this.dataUrl = null;

        /**
         * dataUrl Loader image
         * @type {Image}
         */
        this.image = new Image();

        this.emptyImageSrc = 'data:image/gif;base64,R0lGODlhAQABAIAAAP///////yH5BAEKAAEALAAAAAABAAEAAAICTAEAOw==';

        /**
         * If currently background is busy with something
         * @type {boolean}
         */
        this.isBusy = false;

        this.busyTimeout = 0;

        /** Data about currently capturing entire page process */
        this.currentEntireCaptureData = {
            canvas: document.createElement('canvas'),
            frameCount: 0,
            pageHeight: 0,
            viewportWidth: 0,
            viewportHeight: 0,
            currentScrollTop: 0
        };

        this.entireCaptureHelperImage = new Image();
    }

    /* methods */
    {
        /**
         * @param {Boolean} busy
         */
        this.setBusy = function(busy)
        {
            clearTimeout(this.busyTimeout);

            if (busy) {
                setTimeout(function(){
                    that.setBusy(false);
                }, 30000);
            }

            this.isBusy = Boolean(busy);
        };

        this.sendMessage = function(r)
        {
            chrome.extension.sendMessage(r);
        };

        this.sendTabMessage = function(tid, r)
        {
            chrome.tabs.sendMessage(tid, r);
        };

        /**
         * Capture visible part
         */
        this.cmd_captureVisible = function()
        {
            this.setBusy(true);

            chrome.tabs.captureVisibleTab(null, {format: 'png'}, function (image) {
                that.setBusy(false);

                if (!image) {
                    return;
                }

                that.dataUrl = image;

                that.openEditorTab();
            });
        };

        this.openEditorTab = function()
        {
            chrome.tabs.create({
                url: chrome.extension.getURL('edit.html'),
                selected: true
            });
        };

        /**
         * Edit page is ready, send it some init data (captured image)
         */
        this.cmd_editReady = function()
        {
            this.sendMessage({
                cmd: 'edit:ready',
                dataUrl: this.dataUrl
            });
        };

        /**
         * Delete captured image
         */
        this.cmd_deleteCapture = function()
        {
            this.dataUrl = null;
        };

        /** others check if background is busy */
        this.cmd_busyCheck = function(sender)
        {
            var response = {
                cmd: 'all:bgBusyResponse',
                busy: this.isBusy
            };

            if (sender.tab) {
                this.sendTabMessage(sender.tab.id, response);
            } else {
                this.sendMessage(response);
            }
        };

        this.resetEntireCaptureInfo = function()
        {
            // canvas resize will clear it's contents
            {
                this.currentEntireCaptureData.canvas.height     = 1;
                this.currentEntireCaptureData.canvas.width      = 1;
                this.currentEntireCaptureData.canvas.height     = 0;
                this.currentEntireCaptureData.canvas.width      = 0;
            }

            this.currentEntireCaptureData.frameCount        = 0;
            this.currentEntireCaptureData.pageHeight        = 0;
            this.currentEntireCaptureData.viewportWidth     = 0;
            this.currentEntireCaptureData.viewportHeight    = 0;
            this.currentEntireCaptureData.currentScrollTop  = 0;
        };

        /**
         * Capture entire page
         */
        this.cmd_captureEntire = function(m)
        {
            this.setBusy(true);

            this.resetEntireCaptureInfo();

            chrome.tabs.executeScript(m.tid, {
                    file: 'js/tab.js'
                },
                function() {
                    that.sendTabMessage(m.tid, {
                        cmd: 'tab:capture:entire:begin'
                    });
                }
            );
        };

        this.cmd_tabCaptureEntireProgress = function(m, tid)
        {
            if (this.currentEntireCaptureData.frameCount == 0) {
                this.currentEntireCaptureData.pageHeight        = m.page.docHeight;
                this.currentEntireCaptureData.viewportWidth     = m.page.vieportSize.x;
                this.currentEntireCaptureData.viewportHeight    = m.page.vieportSize.y;
                this.currentEntireCaptureData.currentScrollTop  = m.page.scroll.top;

                if (this.isRetinaDisplay()) {
                    this.currentEntireCaptureData.pageHeight *= 2;
                    this.currentEntireCaptureData.viewportWidth *= 2;
                    this.currentEntireCaptureData.viewportHeight *= 2;
                }

                // resize canvas to entire page size
                this.currentEntireCaptureData.canvas.height = this.currentEntireCaptureData.pageHeight;
                this.currentEntireCaptureData.canvas.width  = this.currentEntireCaptureData.viewportWidth;
            } else {
                if (this.currentEntireCaptureData.currentScrollTop >= m.page.scroll.top) {
                    that.finishEntireCapture(tid);
                    return;
                }
                
                this.currentEntireCaptureData.currentScrollTop = m.page.scroll.top;
            }

            this.currentEntireCaptureData.frameCount++;

            chrome.tabs.captureVisibleTab(null, {format: 'png'}, function (dataUrl) {
                if (!dataUrl || that.currentEntireCaptureData.frameCount > 100) {
                    that.finishEntireCapture(tid);
                    return;
                }

                that.drawDataUrlToEntireCaptureCanvas(that.currentEntireCaptureData.currentScrollTop, dataUrl, function(){
                    if (that.currentEntireCaptureData.currentScrollTop + that.currentEntireCaptureData.viewportHeight >= that.currentEntireCaptureData.pageHeight) {
                        that.finishEntireCapture(tid);
                        return;
                    }

                    that.sendTabMessage(tid, {
                        cmd: 'tab:capture:entire:continue'
                    });
                });
            });
        };

        this.drawDataUrlToEntireCaptureCanvas = function(top, dataUrl, customCallback)
        {
            customCallback = customCallback || function(){};

            this.entireCaptureHelperImageOnLoad = function()
            {
                that.currentEntireCaptureData.canvas.getContext('2d').drawImage(
                    that.entireCaptureHelperImage,
                    0,
                    that.isRetinaDisplay() ? (top * 2) : top
                );

                customCallback();
            };

            that.entireCaptureHelperImage.src = dataUrl;
        };

        this.finishEntireCapture = function(tid)
        {
            this.sendTabMessage(tid, {
                cmd: 'tab:capture:entire:stop'
            });

            that.dataUrl = window.ddd = that.currentEntireCaptureData.canvas.toDataURL('image/png');

            that.resetEntireCaptureInfo();

            that.setBusy(false);

            that.openEditorTab();
        };

        this.isRetinaDisplay = function()
        {
            if (window.matchMedia) {
                var mq = window.matchMedia(
                    'only screen and (min--moz-device-pixel-ratio: 1.3), '+
                    'only screen and (-o-min-device-pixel-ratio: 2.6/2), '+
                    'only screen and (-webkit-min-device-pixel-ratio: 1.3), '+
                    'only screen and (min-device-pixel-ratio: 1.3), '+
                    'only screen and (min-resolution: 1.3dppx)'
                );

                return (mq && mq.matches || (window.devicePixelRatio > 1));
            }
        }
    }

    var that = this;

    // constructor
    (function()
    {
        chrome.extension.onMessage.addListener(function(m, sender, sendResponse) {
            switch (m.cmd) {
                case 'bg:capture:visible':
                    if (that.isBusy) return;
                    that.cmd_captureVisible();
                    break;
                case 'bg:capture:entire':
                    if (that.isBusy) return;
                    that.cmd_captureEntire(m);
                    break;
                case 'bg:edit:ready':
                    if (that.isBusy) return;
                    that.cmd_editReady();
                    break;
                case 'bg:delete_capture':
                    if (that.isBusy) return;
                    that.cmd_deleteCapture();
                    break;
                case 'bg:AreYouBusy?':
                    that.cmd_busyCheck(sender);
                    break;
                case 'bg:tab:capture:entire:progress':
                    if (!sender.tab) return;
                    that.cmd_tabCaptureEntireProgress(m, sender.tab.id);
                    break;
            }
        });

        /** prepare loader image (for right click context menu) */
        {
            (function(){
                var canvas = document.createElement("canvas");
                var ctx    = canvas.getContext("2d");

                that.image.onload = function()
                {
                    if (that.image.src === that.emptyImageSrc) {
                        // skip resets
                        return;
                    }

                    try {
                        ctx.clearRect (0, 0, canvas.width, canvas.height);

                        canvas.width  = that.image.width;
                        canvas.height = that.image.height;

                        ctx.drawImage(that.image, 0, 0);

                        that.dataUrl = canvas.toDataURL("image/png");

                        // clear memory
                        {
                            that.image.src = that.emptyImageSrc;
                            canvas.width = canvas.height = 0;
                        }

                        that.openEditorTab();
                    } catch (e) {
                        alert('Eroare la încărcarea imaginii.');
                    }
                };

                that.image.onerror = function()
                {
                    alert('Imaginea nu poate fi procesată');
                };
            })();
        }

        /** prepare image that helps for entire capture */
        (function(){
            var onload = function(){
                if (typeof that.entireCaptureHelperImageOnLoad == 'function') {
                    that.entireCaptureHelperImageOnLoad();
                    that.entireCaptureHelperImageOnLoad = null;
                    that.entireCaptureHelperImage.src = '';
                }
            };

            that.entireCaptureHelperImage.onload  = onload;
            that.entireCaptureHelperImage.onerror = onload;
        })();

        /**
         * Handler of chrome context menu creation process -creates a new item in the context menu
         */
        chrome.contextMenus.create({
            "title": "Încarcă Imaginea pe Static.md",
            "type": "normal",
            "contexts": ["image"],
            "onclick": function (info, tab) {
                that.image.src = that.emptyImageSrc;

                if (!(info && info['srcUrl'])) {
                    alert('Imaginea nu poate fi procesată');
                    return false;
                }

                that.image.src = info.srcUrl;
            }
        });
    })();
})();
