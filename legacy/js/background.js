new (function()
{
    /* properties */
    {
        this.imageURL = null;
    }

    /* methods */
    {
        this.loadImageAndOpenEditor = function(url)
        {
            that.imageURL = url;
            that.openEditorTab();
        };

        this.openEditorTab = function()
        {
            chrome.tabs.create({ url: chrome.runtime.getURL('edit.html'), selected: true });
        };

        this.cmd_editReady = function()
        {
            chrome.runtime.sendMessage({ cmd: 'edit:ready', imageURL: this.imageURL });
        };

        this.cmd_deleteCapture = function()
        {
            this.imageURL = null;
        };
    }

    var that = this;

    // constructor
    (function()
    {
        chrome.action.onClicked.addListener(function(tab) {
            chrome.tabs.captureVisibleTab(null, {format: 'png'}, function (imageDataUri) {
                if (imageDataUri) {
                    that.loadImageAndOpenEditor(imageDataUri);
                }
            });
        });

        chrome.runtime.onMessage.addListener(function(m, sender, sendResponse) {
            switch (m.cmd) {
                case 'bg:edit:ready': return that.cmd_editReady();
                case 'bg:delete_capture': return that.cmd_deleteCapture();
            }
        });

        chrome.contextMenus.create({
            "id": "static-shot",
            "title": "Edit with StaticShot",
            "type": "normal",
            "contexts": ["image"],
        });
        chrome.contextMenus.onClicked.addListener(function (info, tab) {
            if (!(info && info['srcUrl'])) {
                console.error('Image load failed (check if "Allow access to file URLs" is Enabled)');
                return false;
            }

            that.loadImageAndOpenEditor(info.srcUrl);
        });
    })();
})();
