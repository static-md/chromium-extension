new (function()
{
    /* properties */
    {
        /**
         * base64 image content
         * todo: maybe switch to Object Url
         * @type string
         */
        this.dataUrl = null;

        /**
         * dataUrl Loader image
         * @type {Image}
         */
        this.image = new Image();

        this.emptyImageSrc = 'data:image/gif;base64,R0lGODlhAQABAIAAAP///////yH5BAEKAAEALAAAAAABAAEAAAICTAEAOw==';
    }

    /* methods */
    {
        this.sendMessage = function(r)
        {
            chrome.extension.sendMessage(r);
        };

        /**
         * Capture visible part
         */
        this.captureVisible = function()
        {
            chrome.tabs.captureVisibleTab(null, {format: 'png'}, function (image) {
                if (image) {
                    that.dataUrl = image;
                    that.openEditorTab();
                }
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
    }

    var that = this;

    // constructor
    (function()
    {
        chrome.browserAction.onClicked.addListener(function(tab) {
            that.captureVisible();
        });

        chrome.extension.onMessage.addListener(function(m, sender, sendResponse) {
            switch (m.cmd) {
                case 'bg:edit:ready':
                    that.cmd_editReady();
                    break;
                case 'bg:delete_capture':
                    that.cmd_deleteCapture();
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
                        alert('Image load failed');
                    }
                };

                that.image.onerror = function()
                {
                    alert('Image load failed');
                };
            })();
        }

        /**
         * Handler of chrome context menu creation process -creates a new item in the context menu
         */
        chrome.contextMenus.create({
            "title": "Edit with StaticShot",
            "type": "normal",
            "contexts": ["image"],
            "onclick": function (info, tab) {
                that.image.src = that.emptyImageSrc;

                if (!(info && info['srcUrl'])) {
                    alert('Image load failed');
                    return false;
                }

                that.image.src = info.srcUrl;
            }
        });
    })();
})();
