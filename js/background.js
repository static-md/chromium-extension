new (function()
{
    /* properties */
    {
        this.imageObjectUrl = '';
    }

    /* methods */
    {
        this.loadImageAndOpenEditor = function(url)
        {
            fetch(url)
                .then(res => res.blob())
                .then(blob => {
                    URL.revokeObjectURL(that.imageObjectUrl);
                    that.imageObjectUrl = URL.createObjectURL(blob);
                    that.openEditorTab();
                });
        };

        this.openEditorTab = function()
        {
            chrome.tabs.create({ url: chrome.extension.getURL('edit.html'), selected: true });
        };

        this.cmd_editReady = function()
        {
            chrome.extension.sendMessage({ cmd: 'edit:ready', imageObjectUrl: this.imageObjectUrl });
        };

        this.cmd_deleteCapture = function()
        {
            URL.revokeObjectURL(this.imageObjectUrl);
            this.imageObjectUrl = null;
        };
    }

    var that = this;

    // constructor
    (function()
    {
        chrome.browserAction.onClicked.addListener(function(tab) {
            chrome.tabs.captureVisibleTab(null, {format: 'png'}, function (imageDataUri) {
                if (imageDataUri) {
                    that.loadImageAndOpenEditor(imageDataUri);
                }
            });
        });

        chrome.extension.onMessage.addListener(function(m, sender, sendResponse) {
            switch (m.cmd) {
                case 'bg:edit:ready': return that.cmd_editReady();
                case 'bg:delete_capture': return that.cmd_deleteCapture();
            }
        });

        chrome.contextMenus.create({
            "title": "Edit with StaticShot",
            "type": "normal",
            "contexts": ["image"],
            "onclick": function (info, tab) {
                if (!(info && info['srcUrl'])) {
                    alert('Image load failed (check if "Allow access to file URLs" is Enabled)');
                    return false;
                }

                that.loadImageAndOpenEditor(info.srcUrl);
            }
        });
    })();
})();
