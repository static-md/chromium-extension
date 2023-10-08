window.addEvent('domready', function()
{
    /** image */
    var imageObjectUrl = '', ratio = 1;

    /* functions */
    {
        function sendMessage(r) {
            chrome.extension.sendMessage(r);
        }

        /**
         * Writes an image into a canvas taking into
         * account the backing store pixel ratio and
         * the device pixel ratio.
         *
         * @author Paul Lewis
         * @source With minor changes http://www.html5rocks.com/en/tutorials/canvas/hidpi/
         * @param {Object} opts The params for drawing an image to the canvas
         */
        function drawImage(opts) {
            if ( ! opts.canvas ) {
                throw("A canvas is required");
            }
            if ( ! opts.image ) {
                throw("Image is required");
            }

            // get the canvas and context
            var canvas = opts.canvas,
                context = canvas.getContext('2d'),
                image = opts.image,

                // now default all the dimension info
                srcx = opts.srcx || 0,
                srcy = opts.srcy || 0,
                srcw = opts.srcw || image.naturalWidth,
                srch = opts.srch || image.naturalHeight,
                desx = opts.desx || srcx,
                desy = opts.desy || srcy,
                desw = opts.desw || srcw,
                desh = opts.desh || srch,
                auto = opts.auto,

                // finally query the various pixel ratios
                devicePixelRatio = window.devicePixelRatio || 1,
                backingStoreRatio = context.webkitBackingStorePixelRatio ||
                    context.mozBackingStorePixelRatio ||
                    context.msBackingStorePixelRatio ||
                    context.oBackingStorePixelRatio ||
                    context.backingStorePixelRatio || 1,

                ratio = devicePixelRatio / backingStoreRatio;

            // ensure we have a value set for auto.
            // If auto is set to false then we
            // will simply not upscale the canvas
            // and the default behaviour will be maintained
            if (typeof auto === 'undefined') {
                auto = true;
            }

            // upscale the canvas if the two ratios don't match
            if (auto && devicePixelRatio !== backingStoreRatio) {

                var oldWidth = canvas.width;
                var oldHeight = canvas.height;
                var r = canvas.width / oldWidth;

                canvas.style.width = (oldWidth / ratio) + 'px';
                canvas.style.height = (oldHeight / ratio) + 'px';

                // now scale the context to counter
                // the fact that we've manually scaled
                // our canvas element
                context.scale(r, r);
            }

            context.drawImage(image, srcx, srcy, srcw, srch, desx, desy, desw, desh);

            return ratio;
        }
    }

    function start_editor() {
        var Canvas = new Class({
            initialize: function()
            {
                this.$element = $('edit-canvas');

                this.width  = 0;
                this.height = 0;

                this.prepare();
            },
            prepare: function()
            {
                var $canvas = this.$element,
                    pic     = new Image(),
                    that    = this;

                pic.onload = function()
                {
                    $canvas.setProperty('width', this.naturalWidth);
                    $canvas.setProperty('height', this.naturalHeight);

                    ratio = drawImage({
                        image: pic,
                        canvas: $canvas
                    });

                    $canvas.getContext('2d').scale(1, 1);

                    pic = undefined;

                    $canvas.getParent().setStyle('display', '');

                    that.update();

                    main();
                };

                pic.src = imageObjectUrl;
            },
            update: function()
            {
                this.width  = parseInt(this.$element.style.width || this.$element.getProperty('width'));
                this.height = parseInt(this.$element.style.height || this.$element.getProperty('height'));
            },
            setSize: function (width, height) {
                this.$element.setProperties({
                    'width': width * ratio,
                    'height': height * ratio
                });

                this.$element.style.width = width +'px';
                this.$element.style.height = height +'px';

                this.update();
            }
        });

        /**
         * contains tools
         */
        var Toolbox = new Class({
            initialize: function()
            {
                /** DOM reference */
                this.$element = Elements.from(this.getHtml());

                /** contains all tools instances */
                this.tools = [];

                /** canvas control instance */
                this.canvas = mainCanvas;

                /** if functionality is blocked (for eg. to prevent use of tools while uploading image) */
                this.blocked = false;

                /** the tool that curretly was clicked to activate, but last active tool was not deactivated */
                this.pendingActivationTool = null;

                /** instance of current active tool */
                this.currentActiveTool = null;

                /** instance of last active tool (before current) */
                this.lastActiveTool = null;

                /** events interaction element */
                this.$eventBox = Elements.from('<div></div>')[0];

                /** storage for others */
                this.data = {
                    color: '#FF0000',
                    lineWidth: Math.ceil(4 / ratio)
                };

                /** prepares */
                {
                    var that = this;

                    // do not click on buttons like on simple links (prevent reset scroll)
                    this.$element.addEvent('click:relay(.tools-wrapper a)', function(e){
                        e.event.preventDefault();
                    });

                    // prevent dblclick on window
                    this.$element.addEvent('dblclick', function(e){
                        e.event.stopPropagation();
                    });

                    // restore initial position of toolbox on dblclick
                    $(window).addEvent('dblclick', function(e){
                        that.resetPosition();
                    });

                    // prevent selection on dblclick
                    $$('html').addEvent('dblclick', function(e){
                        if(document.selection && document.selection.empty) {
                            document.selection.empty();
                        } else if(window.getSelection) {
                            window.getSelection().removeAllRanges();
                        }
                    });
                }
            },
            /**
             * @private
             * @returns {string}
             */
            getHtml: function()
            {
                return ''+
                '<div id="toolbox">'+
                    '<table border="0" cellpadding="0" cellspacing="0">'+
                        '<tr class="tools-wrapper"></tr>'+
                    '</table>'+
                '</div>';
            },
            /**
             * After all tools instances was added
             * @private
             */
            initTools: function()
            {
                var that = this;
                var $toolsWrapper = this.$element.getElement('.tools-wrapper')[0];

                // add tools
                Array.each(this.tools, function(tool, index){
                    tool.setToolbox(that);

                    var $toolWrapper = Elements.from('<td class="tool-wrapper"></td>')[0];
                    tool.$element.inject($toolWrapper);
                    $toolWrapper.inject($toolsWrapper);

                    tool.init();
                });
            },
            /**
             * Reset toolbox position
             * Set centered at the bottom of the page
             * @private
             */
            resetPosition: function()
            {
                var size = {
                    window: {
                        width:  $(window).getWidth(),
                        height: $(window).getHeight()
                    },
                    toolbox: {
                        width:  this.$element[0].getWidth(),
                        height: this.$element[0].getHeight()
                    },
                    canvas: {
                        width:  this.canvas.width,
                        height: this.canvas.height
                    }
                };

                var topOffset = size.canvas.height + 20;

                if (topOffset + size.toolbox.height + 20 > size.window.height) {
                    topOffset = size.window.height - size.toolbox.height - 20;

                    if (topOffset < 0) {
                        topOffset = 0;
                    }
                }

                var leftOffset = Math.floor(size.window.width / 2) - Math.floor(size.toolbox.width / 2);

                if (leftOffset < 0) {
                    leftOffset = 0;
                }

                this.$element.setStyles({
                    top: topOffset +'px',
                    left: leftOffset +'px'
                });
            },

            /** Public Methods */

            /**
             * Everything prepared
             * @public
             */
            init: function()
            {
                this.initTools();

                this.$element.inject(document.body, 'top');

                this.resetPosition();

                var that = this;

                // animate tools some time to get eyes attention (on colorful images, toolbox is hard to observe)
                {
                    var animationClasses = 'capture-attention-animation';

                    this.$element.addClass(animationClasses);

                    function removeAnimation(){
                        that.$element.removeClass(animationClasses);
                        that.$element.removeEvent('mouseover', removeAnimation);
                    };

                    this.$element.addEvent('mouseover', removeAnimation);

                    setTimeout(removeAnimation, 2000);
                }
            },
            /**
             * Add tool instance
             * @public
             */
            addTool: function(tool)
            {
                this.tools.push(tool);
            },
            /**
             * Set currently active tool
             */
            activateTool: function(tool)
            {
                if (this.blocked) {
                    console.log ('[Warning] Toolbox is blocked. Cannot activate tool.');
                    return false;
                }

                if (this.currentActiveTool === tool) {
                    console.log ('[Info] Already active');
                    return false;
                }

                this.pendingActivationTool = tool;

                this.lastActiveTool = this.currentActiveTool;

                this.deactivateCurrentActiveTool();

                this.pendingActivationTool = null;

                tool.activate();

                this.currentActiveTool = tool;

                this.currentActiveTool.isActive = true;

                return true;
            },
            deactivateCurrentActiveTool: function()
            {
                if (this.currentActiveTool !== null) {
                    this.currentActiveTool.deactivate();
                    this.currentActiveTool.isActive = false;
                    this.currentActiveTool = null;
                }
            },
            activateToolByName: function(name)
            {
                var foundTool = null;

                try {
                    Array.each(this.tools, function(tool, index){
                        if (tool.name == name) {
                            foundTool = tool;
                            throw "break";
                        }
                    });
                } catch (e) {
                    if(e != "break") {
                        throw e;
                    }
                }

                if (foundTool === null) {
                    console.log ('[Warning] Tool name not found', name);
                    return false;
                } else {
                    this.activateTool(foundTool);
                    return true;
                }
            }
        });

        /** Abstract Tool */
        var Tool = new Class({
            initialize: function()
            {
                this.toolbox  = null;
                this.isActive = false;
            },
            setToolbox: function(toolbox)
            {
                this.toolbox = toolbox;
            },
            name: '',                   // required (lowercase)
            init: function(){},         // abstract
            activate: function(){},     // abstract (optional)
            deactivate: function(){}    // abstract (optional)
        });

        var Tools = {
            /** make Toolbox draggable */
            Drag: new Class({
                Extends: Tool,
                initialize: function()
                {
                    this.parent();

                    this.name = 'drag';

                    this.$element = Elements.from('<div class="tool handle" title="Move the toolbar"></div>')[0];
                },
                init: function()
                {
                    this.makeDraggable();
                },
                /**
                 * @private
                 */
                makeDraggable: function()
                {
                    var $toolbox = this.toolbox.$element;
                    var $handle  = $toolbox.getElement('.handle')[0];

                    // mouse position in handle on mousedown
                    var shift = {
                        x: 0,
                        y: 0
                    };

                    /** Do not allow element to be dragged outside page borders */
                    function fixXY(xy) {
                        var left = xy[0];
                        var top  = xy[1];

                        if (left < 0) left = 0;
                        if (top  < 0) top  = 0;

                        var maxWidth = $(window).getWidth() - $toolbox.getWidth();
                        if (left > maxWidth) left = maxWidth;

                        var maxHeight = $(window).getHeight() - $toolbox.getHeight();
                        if (top > maxHeight) top = maxHeight;

                        return [left, top];
                    }

                    function elementMove(e) {
                        var left = e.event.clientX + shift.x;
                        var top  = e.event.clientY + shift.y;

                        var xy = fixXY([left, top]);

                        left = xy[0];
                        top  = xy[1];

                        $toolbox.setStyle('left', left + 'px');
                        $toolbox.setStyle('top', top + 'px');
                    }

                    function mouseUp() {
                        $(window).removeEvent('mousemove', elementMove);
                    }

                    function mouseDown(e) {
                        if (e.rightClick) {
                            return;
                        }

                        var left = parseInt($toolbox.getStyle('left'));
                        shift.x = (isNaN(left) ? 0 : left) - e.event.clientX;

                        var top = parseInt($toolbox.getStyle('top'));
                        shift.y = (isNaN(top) ? 0 : top) - e.event.clientY;

                        mouseUp();
                        $(window).addEvent('mousemove', elementMove);

                        e.preventDefault();
                    }

                    $handle.addEvent('mousedown', mouseDown);
                    $(window).addEvent('mouseup', mouseUp);

                    $(window).addEvent('resize', function(){
                        var left = parseInt($toolbox.getStyle('left'));
                        var top  = parseInt($toolbox.getStyle('top'));

                        var xy = fixXY([left, top]);

                        left = xy[0];
                        top  = xy[1];

                        $toolbox.setStyle('left', left + 'px');
                        $toolbox.setStyle('top', top + 'px');
                    });
                }
            }),
            Save: new Class({
                Extends: Tool,
                initialize: function()
                {
                    this.parent();

                    this.name = 'save';

                    this.notAllowedForAutoReactivation = ['undo', 'redo', 'upload', 'drag', 'crop', 'save'];

                    /** DOM reference */
                    this.$element = Elements.from('<a href="#" class="tool save-to-disk" title="Download"></a>')[0];
                },
                init: function(){
                    var that = this;

                    this.$element.addEvent('click', function(e)
                    {
                        that.toolbox.activateTool(that);

                        var d = new Date(),
                            date    = d.getDate(),
                            month   = d.getMonth() + 1,
                            year    = d.getFullYear(),
                            hours   = d.getHours(),
                            minutes = d.getMinutes(),
                            seconds = d.getSeconds();

                        if (date < 10)    date    = '0'+ date;
                        if (month < 10)   month   = '0'+ month;
                        if (hours < 10)   hours   = '0'+ hours;
                        if (minutes < 10) minutes = '0'+ minutes;
                        if (seconds < 10) seconds = '0'+ seconds;

                        var filename = 'StaticShot_'+ date +'-'+ month +'-'+ year +'_'+ hours +'-'+ minutes +'-'+ seconds +'.png';

                        that.toolbox.canvas.$element.toBlob(function(blob){
                            saveAs(blob, filename);
                        });
                    });
                },
                activate: function()
                {
                    this.$element.addClass('active');

                    var that = this;

                    setTimeout(function(){
                        if (
                            that.toolbox.lastActiveTool
                                && !that.notAllowedForAutoReactivation.contains(that.toolbox.lastActiveTool.name)
                                && that.toolbox.activateToolByName(that.toolbox.lastActiveTool.name)
                            ) {
                            //console.log ('[Info] Last tool reactivated');
                        } else {
                            that.toolbox.deactivateCurrentActiveTool();
                        }
                    }, 12);
                },
                deactivate: function()
                {
                    this.$element.removeClass('active');
                }
            }),
            Upload: new Class({
                Extends: Tool,
                initialize: function()
                {
                    this.parent();

                    this.name = 'upload';

                    /** DOM reference */
                    this.$element = Elements.from('<a href="#" class="tool upload-image" title="Upload"></a>')[0];

                    /** timeout to remove error */
                    this.errorTimeoutId = 0;

                    /** how much time to show error style */
                    this.errorTimeoutTime = 2000;
                },
                init: function(){
                    var APIv2 = {
                        /**
                         * @public
                         */

                        isBusy: function() {
                            return Boolean(this.currentOptions);
                        },
                        upload: function(options) {
                            if (this.currentOptions) {
                                return false;
                            }

                            this.currentOptions = Object.append({
                                image: new Blob(),
                                onSuccess: function(data) {
                                    //
                                },
                                onError: function(errorMessage) {
                                    //
                                }
                            }, options);

                            delete options;

                            this.readCurrentImageMD5();

                            return true;
                        },

                        /**
                         * @private
                         */

                        currentOptions: null,
                        /*
                         * A JavaScript implementation of the RSA Data Security, Inc. MD5 Message
                         * Digest Algorithm, as defined in RFC 1321.
                         * Copyright (C) Paul Johnston 1999 - 2000.
                         * Updated by Greg Holt 2000 - 2001.
                         * See http://pajhome.org.uk/site/legal.html for details.
                         */
                        md5: function(){"use strict";function n(n){var r,t="";for(r=0;3>=r;r++)t+=h.charAt(n>>8*r+4&15)+h.charAt(n>>8*r&15);return t}function r(n){var r,t=(n.length+8>>6)+1,u=new Array(16*t);for(r=0;16*t>r;r++)u[r]=0;for(r=0;r<n.length;r++)u[r>>2]|=n.charCodeAt(r)<<r%4*8;return u[r>>2]|=128<<r%4*8,u[16*t-2]=8*n.length,u}function t(n,r){var t=(65535&n)+(65535&r),u=(n>>16)+(r>>16)+(t>>16);return u<<16|65535&t}function u(n,r){return n<<r|n>>>32-r}function e(n,r,e,c,f,o){return t(u(t(t(r,n),t(c,o)),f),e)}function c(n,r,t,u,c,f,o){return e(r&t|~r&u,n,r,c,f,o)}function f(n,r,t,u,c,f,o){return e(r&u|t&~u,n,r,c,f,o)}function o(n,r,t,u,c,f,o){return e(r^t^u,n,r,c,f,o)}function i(n,r,t,u,c,f,o){return e(t^(r|~u),n,r,c,f,o)}function a(u){var e,a,h,v,g,l=r(u),A=1732584193,d=-271733879,s=-1732584194,b=271733878;for(e=0;e<l.length;e+=16)a=A,h=d,v=s,g=b,A=c(A,d,s,b,l[e+0],7,-680876936),b=c(b,A,d,s,l[e+1],12,-389564586),s=c(s,b,A,d,l[e+2],17,606105819),d=c(d,s,b,A,l[e+3],22,-1044525330),A=c(A,d,s,b,l[e+4],7,-176418897),b=c(b,A,d,s,l[e+5],12,1200080426),s=c(s,b,A,d,l[e+6],17,-1473231341),d=c(d,s,b,A,l[e+7],22,-45705983),A=c(A,d,s,b,l[e+8],7,1770035416),b=c(b,A,d,s,l[e+9],12,-1958414417),s=c(s,b,A,d,l[e+10],17,-42063),d=c(d,s,b,A,l[e+11],22,-1990404162),A=c(A,d,s,b,l[e+12],7,1804603682),b=c(b,A,d,s,l[e+13],12,-40341101),s=c(s,b,A,d,l[e+14],17,-1502002290),d=c(d,s,b,A,l[e+15],22,1236535329),A=f(A,d,s,b,l[e+1],5,-165796510),b=f(b,A,d,s,l[e+6],9,-1069501632),s=f(s,b,A,d,l[e+11],14,643717713),d=f(d,s,b,A,l[e+0],20,-373897302),A=f(A,d,s,b,l[e+5],5,-701558691),b=f(b,A,d,s,l[e+10],9,38016083),s=f(s,b,A,d,l[e+15],14,-660478335),d=f(d,s,b,A,l[e+4],20,-405537848),A=f(A,d,s,b,l[e+9],5,568446438),b=f(b,A,d,s,l[e+14],9,-1019803690),s=f(s,b,A,d,l[e+3],14,-187363961),d=f(d,s,b,A,l[e+8],20,1163531501),A=f(A,d,s,b,l[e+13],5,-1444681467),b=f(b,A,d,s,l[e+2],9,-51403784),s=f(s,b,A,d,l[e+7],14,1735328473),d=f(d,s,b,A,l[e+12],20,-1926607734),A=o(A,d,s,b,l[e+5],4,-378558),b=o(b,A,d,s,l[e+8],11,-2022574463),s=o(s,b,A,d,l[e+11],16,1839030562),d=o(d,s,b,A,l[e+14],23,-35309556),A=o(A,d,s,b,l[e+1],4,-1530992060),b=o(b,A,d,s,l[e+4],11,1272893353),s=o(s,b,A,d,l[e+7],16,-155497632),d=o(d,s,b,A,l[e+10],23,-1094730640),A=o(A,d,s,b,l[e+13],4,681279174),b=o(b,A,d,s,l[e+0],11,-358537222),s=o(s,b,A,d,l[e+3],16,-722521979),d=o(d,s,b,A,l[e+6],23,76029189),A=o(A,d,s,b,l[e+9],4,-640364487),b=o(b,A,d,s,l[e+12],11,-421815835),s=o(s,b,A,d,l[e+15],16,530742520),d=o(d,s,b,A,l[e+2],23,-995338651),A=i(A,d,s,b,l[e+0],6,-198630844),b=i(b,A,d,s,l[e+7],10,1126891415),s=i(s,b,A,d,l[e+14],15,-1416354905),d=i(d,s,b,A,l[e+5],21,-57434055),A=i(A,d,s,b,l[e+12],6,1700485571),b=i(b,A,d,s,l[e+3],10,-1894986606),s=i(s,b,A,d,l[e+10],15,-1051523),d=i(d,s,b,A,l[e+1],21,-2054922799),A=i(A,d,s,b,l[e+8],6,1873313359),b=i(b,A,d,s,l[e+15],10,-30611744),s=i(s,b,A,d,l[e+6],15,-1560198380),d=i(d,s,b,A,l[e+13],21,1309151649),A=i(A,d,s,b,l[e+4],6,-145523070),b=i(b,A,d,s,l[e+11],10,-1120210379),s=i(s,b,A,d,l[e+2],15,718787259),d=i(d,s,b,A,l[e+9],21,-343485551),A=t(A,a),d=t(d,h),s=t(s,v),b=t(b,g);return n(A)+n(d)+n(s)+n(b)}var h="0123456789abcdef";return a}(),
                        readCurrentImageMD5: (function () {
                            var reader = new FileReader;

                            reader.onerror = function () {
                                {
                                    var onError = APIv2.currentOptions.onError;

                                    APIv2.currentOptions = null;

                                    onError('Citirea conținutului imaginii a eșuat.');
                                }
                            };

                            reader.onabort = function () {
                                {
                                    var onError = APIv2.currentOptions.onError;

                                    APIv2.currentOptions = null;

                                    onError('Citirea conținutului imaginii a fost întreruptă.');
                                }
                            };

                            reader.onload = function () {
                                var md5 = APIv2.md5(reader.result);

                                APIv2.tokenGetter.append('md5', md5);
                                APIv2.tokenGetter.send();
                            };

                            return function () {
                                reader.readAsBinaryString(APIv2.currentOptions.image);
                            };
                        })(),
                        tokenGetter: new Request.File({
                            url: 'https://static.md/api/v2/get-token/',
                            onSuccess: function(response){
                                APIv2.tokenGetter.formData = new FormData(); // clear memory

                                try {
                                    response = JSON.parse(response);
                                } catch (e) {
                                    response = {error: 'Eroare server'};
                                }

                                if (response.error) {
                                    {
                                        var onError = APIv2.currentOptions.onError;

                                        APIv2.currentOptions = null;

                                        onError(response.error);
                                    }
                                } else {
                                    setTimeout(function(){
                                        APIv2.uploader.append('token', response.token);
                                        APIv2.uploader.append('image', APIv2.currentOptions.image);
                                        APIv2.uploader.send();
                                    }, response.token_valid_after_seconds * 1000);
                                }
                            },
                            onFailure: function(){
                                APIv2.tokenGetter.formData = new FormData(); // clear memory

                                {
                                    var onError = APIv2.currentOptions.onError;

                                    APIv2.currentOptions = null;

                                    onError('Încărcarea imaginii a eșuat.');
                                }
                            }
                        }),
                        uploader: new Request.File({
                            url: 'https://static.md/api/v2/upload/',
                            onSuccess: function(response){
                                APIv2.uploader.formData = new FormData(); // clear memory

                                try {
                                    response = JSON.parse(response);
                                } catch (e) {
                                    response = {error: 'Eroare server'};
                                }

                                if (response.error) {
                                    {
                                        var onError = APIv2.currentOptions.onError;

                                        APIv2.currentOptions = null;

                                        onError(response.error);
                                    }
                                } else {
                                    APIv2.currentOptions.onSuccess(response);
                                }
                            },
                            onFailure: function(){
                                APIv2.uploader.formData = new FormData(); // clear memory

                                {
                                    var onError = APIv2.currentOptions.onError;

                                    APIv2.currentOptions = null;

                                    onError('Încărcarea imaginii a eșuat.');
                                }
                            }
                        })
                    };

                    var that = this;

                    this.$element.addEvent('click', function(e) {
                        if (that.toolbox.blocked) {
                            console.log ('Vă rugăm așteptați finisarea operațiunii curente');
                            return false;
                        }

                        that.toolbox.activateTool(that);
                        that.toolbox.blocked = true;
                        that.toggleLoading(true);

                        APIv2.upload({
                            image: that.dataUrlToBlob(
                                that.toolbox.canvas.$element.toDataURL('image/png')
                            ),
                            onError: function(message) {
                                that.toggleLoading(false);
                                that.toggleError(message);

                                that.toolbox.blocked = false;
                            },
                            onSuccess: function(response) {
                                sendMessage({
                                    cmd: 'bg:delete_capture'
                                });

                                setTimeout(function(){
                                    window.location.replace((response.page || response.image));
                                }, 1000);
                            }
                        });
                    });
                },
                toggleLoading: function(show)
                {
                    show = show || false;

                    if (show) {
                        this.$element.addClass('upload-image-loading');
                    } else {
                        this.$element.removeClass('upload-image-loading');
                    }
                },
                toggleError: function(message)
                {
                    message = message || false;

                    var that = this;

                    if (message) {
                        clearTimeout(this.errorTimeoutId);

                        this.$element.addClass('upload-image-error');
                        console.log (message);
                        alert(message);

                        this.errorTimeoutId = setTimeout(function(){
                            that.$element.removeClass('upload-image-error');
                        }, this.errorTimeoutTime);
                    } else {
                    }
                },
                dataUrlToBlob: function(dataURL)
                {
                    var BASE64_MARKER = ';base64,';

                    if (dataURL.indexOf(BASE64_MARKER) == -1) {
                        var parts = dataURL.split(',');
                        var contentType = parts[0].split(':')[1];
                        var raw = parts[1];

                        return new Blob([raw], {type: contentType});
                    }

                    var parts = dataURL.split(BASE64_MARKER);
                    var contentType = parts[0].split(':')[1];
                    var raw = window.atob(parts[1]);
                    var rawLength = raw.length;

                    var uInt8Array = new Uint8Array(rawLength);

                    for (var i = 0; i < rawLength; ++i) {
                        uInt8Array[i] = raw.charCodeAt(i);
                    }

                    return new Blob([uInt8Array], {type: contentType});
                },
                activate: function()
                {
                },
                deactivate: function()
                {
                }
            }),
            Crop: new Class({
                Extends: Tool,
                initialize: function()
                {
                    this.parent();

                    this.name = 'crop';

                    var that = this;

                    /** DOM reference */
                    this.$element = Elements.from('<a href="#" class="tool crop-tool" title="Crop"></a>')[0];
                    /** DOM reference, store all edit crop size divs */
                    this.$crop = Elements.from(
                        '<div class="crop-editor">'+
                            '<div class="included">'+
                                '<div class="resize resize-top"></div>'+
                                '<div class="resize resize-top-right"></div>'+
                                '<div class="resize resize-right"></div>'+
                                '<div class="resize resize-right-bottom"></div>'+
                                '<div class="resize resize-bottom"></div>'+
                                '<div class="resize resize-bottom-left"></div>'+
                                '<div class="resize resize-left"></div>'+
                                '<div class="resize resize-left-top"></div>'+
                                '<div class="info"></div>'+
                            '</div>'+
                            '<div class="excluded excluded-1"></div>'+
                            '<div class="excluded excluded-2"></div>'+
                            '<div class="excluded excluded-3"></div>'+
                            '<div class="excluded excluded-4"></div>'+
                        '</div>'
                    )[0];
                    /** select once, to prevent select on every frame */
                    this.$elements = {
                        excluded1: this.$crop.getElement('.excluded-1'),
                        excluded2: this.$crop.getElement('.excluded-2'),
                        excluded3: this.$crop.getElement('.excluded-3'),
                        excluded4: this.$crop.getElement('.excluded-4'),
                        included:  this.$crop.getElement('.included'),
                        info:      this.$crop.getElement('.info')
                    };

                    /** prepare $crop */
                    {
                        this.$crop.addEvent('mousedown', function(e){
                            if (e.rightClick) {
                                return;
                            }

                            e.preventDefault();

                            that.handleMouseDown(e);
                        });

                        // here :relay() doesn't work, included mousedown also catches it
                        this.$elements.included.getElements('.resize').addEvent('mousedown', function(e){
                            if (e.rightClick) {
                                return;
                            }

                            e.preventDefault();
                            e.stopPropagation();

                            that.handleResizeMouseDown(e);
                        });

                        this.$elements.included.addEvent('mousedown', function(e){
                            if (e.rightClick) {
                                return;
                            }

                            e.preventDefault();
                            e.stopPropagation();

                            that.handleIncludedMouseDown(e);
                        });
                    }

                    /** to be able to check if changed */
                    this.lastReadyState = false;
                },
                init: function()
                {
                    var that = this;

                    this.reset();

                    this.$element.addEvent('click', function(){
                        var activated = that.toolbox.activateTool(that);

                        if (!activated) {
                            that.makeCrop();
                        }
                    });
                },
                reset: function()
                {
                    /** canvas dimensions, maximal limits */
                    this.max = {
                        x: this.toolbox.canvas.width,
                        y: this.toolbox.canvas.height
                    };
                    /** mouse coordinates create crop rectangle */
                    this.mouse = {
                        begin: {x: -100, y: -100},
                        end:   {x: -100, y: -100}
                    };
                    /** mouse stores correct, changed data. this stores what was cut but need to participate in calculation */
                    this.mouseRealEnd = {x: 0, y: 0};
                    /** real correct crop rectangle coordinates (top-left and right-bottom) */
                    this.crop = {
                        begin: {x: -100, y: -100},
                        end:   {x: -100, y: -100}
                    };
                    /** what parts are currently resize */
                    this.resizeMode = {
                        top:    false,
                        right:  false,
                        bottom: false,
                        left:   false
                    };
                    /** mouse position inside included zone when begin drag */
                    this.includedMouseDownShift = {
                        x: 0,
                        y: 0
                    };

                    this.isReady();
                },
                activate: function()
                {
                    this.$element.addClass('active');

                    this.$crop.inject(this.toolbox.canvas.$element.getParent(), 'top');

                    this.reset();
                    this.fixMouse();
                    this.prepareCrop();
                    this.drawCropEditor(true);

                    if (!this.isActive) {
                        this.$elements.included.setStyles({
                            top:    '-100px',
                            left:   '-100px',
                            height: '0px',
                            width:  '0px'
                        });
                    }
                },
                deactivate: function()
                {
                    this.$element.removeClass('active');
                    this.isReady();

                    this.toolbox.canvas.$element.getParent().getElement('.crop-editor').dispose();

                    $(window).removeEvent('keyup', this.keyUpCallback);

                    this.reset();
                },
                /** process mouse down */
                handleMouseDown: function(e)
                {
                    var that = this;

                    $(window).removeEvent('keyup', this.keyUpCallback);

                    { // mouse move
                        var windowMouseMove = function(e){
                            that.handleMouseMove(e);
                        };
                        $(window).addEvent('mousemove', windowMouseMove);
                    }

                    { // mouse up
                        var windowMouseUp = function(e){
                            $(window).removeEvent('mouseup', windowMouseUp);
                            $(window).removeEvent('mousemove', windowMouseMove);

                            that.handleMouseUp(e);
                        };
                        $(window).addEvent('mouseup', windowMouseUp);
                    }

                    var coordinates = this.$crop.getCoordinates();

                    this.mouse.begin.x = this.mouse.end.x = this.mouseRealEnd.x = e.event.pageX - coordinates.left;
                    this.mouse.begin.y = this.mouse.end.y = this.mouseRealEnd.y = e.event.pageY - coordinates.top;

                    this.fixMouse();
                    this.prepareCrop();
                    this.drawCropEditor(true);

                    this.isReady();
                },
                /** process mouse move */
                handleMouseMove: function(e)
                {
                    var coordinates = this.$crop.getCoordinates();

                    this.mouse.end.x = this.mouseRealEnd.x = e.event.pageX - coordinates.left;
                    this.mouse.end.y = this.mouseRealEnd.y = e.event.pageY - coordinates.top;

                    this.fixMouse();
                    this.prepareCrop();
                    this.drawCropEditor(true);
                },
                /** process mouse up */
                handleMouseUp: function(e)
                {
                    var that = this;

                    this.keyUpCallback = function(e){
                        that.handleKeyUp(e);
                    };

                    $(window).addEvent('keyup', this.keyUpCallback);

                    this.isReady();
                },
                /** fix mouse x y to not exceed limits */
                fixMouse: function()
                {
                    var that = this;

                    Array.each(['begin', 'end'], function(p){
                        Array.each(['x', 'y'], function(c){
                            if (that.mouse[p][c] < 0) {
                                that.mouse[p][c] = 0;
                            }
                            if (that.mouse[p][c] > that.max[c]) {
                                that.mouse[p][c] = that.max[c];
                            }
                        });
                    });
                },
                /** create correct crop coordinates from mouse coordinates */
                prepareCrop: function()
                {
                    var that = this;

                    // reset
                    this.crop = {
                        begin: {x: 0, y: 0},
                        end:   {x: 0, y: 0}
                    };

                    var max = {
                        x: 0,
                        y: 0
                    };
                    var min = Object.clone(this.max);

                    // find max and min in mouse coordinates
                    Array.each(['begin', 'end'], function(p){
                        Array.each(['x', 'y'], function(c){
                            if (max[c] < that.mouse[p][c]) {
                                max[c] = that.mouse[p][c];
                            }
                            if (min[c] > that.mouse[p][c]) {
                                min[c] = that.mouse[p][c];
                            }
                        });
                    });

                    this.crop = {
                        begin: min,
                        end: max
                    };
                },
                /** show and update crop tools */
                drawCropEditor: function(show)
                {
                    if (!show) {
                        this.$crop.setStyle('display', 'none');
                        this.$elements.included.removeProperty('style');
                        this.$elements.excluded1.removeProperty('style');
                        this.$elements.excluded2.removeProperty('style');
                        this.$elements.excluded3.removeProperty('style');
                        this.$elements.excluded4.removeProperty('style');
                        this.$elements.info.set('text', '');
                        this.$elements.included.removeAttribute('title');
                        return;
                    }

                    this.$crop.setStyle('display', 'block');

                    // top right
                    this.$elements.excluded1.setStyles({
                        top:    0,
                        left:   0,
                        height: this.crop.begin.y +'px',
                        width:  this.crop.end.x   +'px'
                    });

                    // top down
                    this.$elements.excluded2.setStyles({
                        top:    0,
                        left:   this.crop.end.x +'px',
                        height: this.crop.end.y +'px',
                        width:  (this.max.x - this.crop.end.x) +'px'
                    });

                    // right left
                    this.$elements.excluded3.setStyles({
                        top:    this.crop.end.y   +'px',
                        left:   this.crop.begin.x +'px',
                        height: (this.max.y - this.crop.end.y) +'px',
                        width:  (this.max.x - this.crop.begin.x) +'px'
                    });

                    // down top
                    this.$elements.excluded4.setStyles({
                        top:    this.crop.begin.y +'px',
                        left:   0,
                        height: (this.max.y - this.crop.begin.y) +'px',
                        width:  this.crop.begin.x +'px'
                    });

                    // included
                    this.$elements.included.setStyles({
                        top:    this.crop.begin.y +'px',
                        left:   this.crop.begin.x +'px',
                        height: (this.crop.end.y - this.crop.begin.y) +'px',
                        width:  (this.crop.end.x - this.crop.begin.x) +'px'
                    });

                    {
                        var info = (this.crop.end.x - this.crop.begin.x) +' x '+ (this.crop.end.y - this.crop.begin.y);

                        this.$elements.info.set('text', info);
                        this.$elements.included.setAttribute('title', info);
                    }
                },
                handleKeyUp: function(e)
                {
                    if (e.key != 'enter') {
                        return false;
                    }

                    this.makeCrop();
                },
                makeCrop: function()
                {
                    var that = this;

                    if (this.isReady()) {
                        // trigger change only when something really changed
                        this.toolbox.$eventBox.fireEvent('beginChange');
                    } else {
                        return false;
                    }

                    var cropSize = {
                        width:  this.crop.end.x - this.crop.begin.x,
                        height: this.crop.end.y - this.crop.begin.y
                    };

                    /** update with new values */
                    {
                        this.max = {
                            y: cropSize.height,
                            x: cropSize.width
                        };
                    }

                    var drawOffset  = {
                        x: this.crop.begin.x,
                        y: this.crop.begin.y
                    };

                    $(window).removeEvent('keyup', this.keyUpCallback);
                    this.drawCropEditor(false);
                    { // fix (leave working but not show)
                        this.$crop.setStyle('display', '');
                        this.$elements.included.setStyles({
                            top: '-100px'
                        });
                    }

                    var canvas = this.toolbox.canvas,
                        image = new Image(),
                        ctx = canvas.$element.getContext('2d');

                    image.onload = function()
                    {
                        {
                            canvas.setSize(cropSize.width, cropSize.height);

                            that.reset();
                        }

                        ctx.drawImage(image, -drawOffset.x * ratio, -drawOffset.y * ratio);

                        image = undefined;
                    };

                    image.src = canvas.$element.toDataURL('image/png');
                },
                /** process mouse down resize */
                handleResizeMouseDown: function(e)
                {
                    var that = this;

                    { // mouse move
                        var windowMouseMove = function(e){
                            that.handleResizeMouseMove(e);
                        };
                        $(window).addEvent('mousemove', windowMouseMove);
                    }

                    { // mouse up
                        var windowMouseUp = function(e){
                            $(window).removeEvent('mouseup', windowMouseUp);
                            $(window).removeEvent('mousemove', windowMouseMove);

                            that.handleResizeMouseUp(e);
                        };
                        $(window).addEvent('mouseup', windowMouseUp);
                    }

                    this.resizeMode = {
                        top:    false,
                        right:  false,
                        bottom: false,
                        left:   false
                    };

                    var $r = e.target;

                    if ($r.hasClass('resize-top')) {
                        this.resizeMode.top = true;

                        // set mouse begin bottom-left from crop
                        this.mouse.begin = {
                            x: this.crop.begin.x,
                            y: this.crop.end.y
                        };
                        this.mouse.end = {
                            x: this.crop.end.x,
                            y: this.crop.begin.y
                        };
                    } else if ($r.hasClass('resize-right')) {
                        this.resizeMode.right = true;

                        // set mouse begin top-left from crop
                        this.mouse.begin = {
                            x: this.crop.begin.x,
                            y: this.crop.begin.y
                        };
                        this.mouse.end = {
                            x: this.crop.end.x,
                            y: this.crop.end.y
                        };
                    } else if ($r.hasClass('resize-bottom')) {
                        this.resizeMode.bottom = true;

                        // set mouse begin top-left from crop
                        this.mouse.begin = {
                            x: this.crop.begin.x,
                            y: this.crop.begin.y
                        };
                        this.mouse.end = {
                            x: this.crop.end.x,
                            y: this.crop.end.y
                        };
                    } else if ($r.hasClass('resize-left')) {
                        this.resizeMode.left = true;

                        // set mouse begin bottom-right from crop
                        this.mouse.begin = {
                            x: this.crop.end.x,
                            y: this.crop.end.y
                        };
                        this.mouse.end = {
                            x: this.crop.begin.x,
                            y: this.crop.begin.y
                        };
                    } else if ($r.hasClass('resize-top-right')) {
                        this.resizeMode.top   = true;
                        this.resizeMode.right = true;

                        // set mouse begin bottom-left from crop
                        this.mouse.begin = {
                            x: this.crop.begin.x,
                            y: this.crop.end.y
                        };
                        this.mouse.end = {
                            x: this.crop.end.x,
                            y: this.crop.begin.y
                        };
                    } else if ($r.hasClass('resize-right-bottom')) {
                        this.resizeMode.right  = true;
                        this.resizeMode.bottom = true;

                        // set mouse begin top-left from crop
                        this.mouse.begin = {
                            x: this.crop.begin.x,
                            y: this.crop.begin.y
                        };
                        this.mouse.end = {
                            x: this.crop.end.x,
                            y: this.crop.end.y
                        };
                    } else if ($r.hasClass('resize-bottom-left')) {
                        this.resizeMode.bottom = true;
                        this.resizeMode.left   = true;

                        // set mouse begin top-right from crop
                        this.mouse.begin = {
                            x: this.crop.end.x,
                            y: this.crop.begin.y
                        };
                        this.mouse.end = {
                            x: this.crop.begin.x,
                            y: this.crop.end.y
                        };
                    } else if ($r.hasClass('resize-left-top')) {
                        this.resizeMode.left = true;
                        this.resizeMode.top  = true;

                        // set mouse begin bottom-right from crop
                        this.mouse.begin = {
                            x: this.crop.end.x,
                            y: this.crop.end.y
                        };
                        this.mouse.end = {
                            x: this.crop.begin.x,
                            y: this.crop.begin.y
                        };
                    }

                    this.mouseRealEnd.x = this.mouse.end.x;
                    this.mouseRealEnd.y = this.mouse.end.y;
                },
                /** process mouse move resize */
                handleResizeMouseMove: function(e)
                {
                    var coordinates = this.$crop.getCoordinates();

                    this.mouseRealEnd.x = e.event.pageX - coordinates.left;
                    if (this.resizeMode.left || this.resizeMode.right) {
                        this.mouse.end.x = this.mouseRealEnd.x;
                    }
                    this.mouseRealEnd.y = e.event.pageY - coordinates.top;
                    if (this.resizeMode.top || this.resizeMode.bottom) {
                        this.mouse.end.y = this.mouseRealEnd.y;
                    }

                    this.fixMouse();
                    this.prepareCrop();
                    this.drawCropEditor(true);
                },
                /** process mouse up */
                handleResizeMouseUp: function(e)
                {
                    this.isReady();
                },
                /** process mouse down */
                handleIncludedMouseDown: function(e)
                {
                    var that = this;

                    /** remember mouse shift on drag begin */
                    {
                        var left = parseInt(this.$elements.included.getStyle('left'));
                        this.includedMouseDownShift.x = (isNaN(left) ? 0 : left) - e.event.clientX;

                        var top = parseInt(this.$elements.included.getStyle('top'));
                        this.includedMouseDownShift.y = (isNaN(top) ? 0 : top) - e.event.clientY;
                    }

                    /** fix */
                    {
                        this.mouseRealEnd.x = this.mouse.end.x;
                        this.mouseRealEnd.y = this.mouse.end.y;
                    }

                    { // mouse move
                        var windowMouseMove = function(e){
                            that.handleIncludedMouseMove(e);
                        };
                        $(window).addEvent('mousemove', windowMouseMove);
                    }

                    { // mouse up
                        var windowMouseUp = function(e){
                            $(window).removeEvent('mouseup', windowMouseUp);
                            $(window).removeEvent('mousemove', windowMouseMove);

                            that.handleIncludedMouseUp(e);
                        };
                        $(window).addEvent('mouseup', windowMouseUp);
                    }
                },
                /** process mouse move resize */
                handleIncludedMouseMove: function(e)
                {
                    var left = e.event.clientX + this.includedMouseDownShift.x;
                    var top  = e.event.clientY + this.includedMouseDownShift.y;

                    /** do not allow drag outside canvas borders */
                    {
                        if (left < 0) left = 0;
                        if (top  < 0) top  = 0;

                        var maxWidth = this.$crop.getWidth() - this.$elements.included.getWidth();
                        if (left > maxWidth) left = maxWidth;

                        var maxHeight = this.$crop.getHeight() - this.$elements.included.getHeight();
                        if (top > maxHeight) top = maxHeight;
                    }

                    var xDiff = this.crop.begin.x - left;
                    this.mouseRealEnd.x -= xDiff;
                    this.mouse.begin.x  -= xDiff;
                    this.mouse.end.x = this.mouseRealEnd.x;

                    var yDiff = this.crop.begin.y - top;
                    this.mouseRealEnd.y -= yDiff;
                    this.mouse.begin.y  -= yDiff;
                    this.mouse.end.y = this.mouseRealEnd.y;

                    this.prepareCrop();
                    this.drawCropEditor(true);
                },
                /** process mouse up */
                handleIncludedMouseUp: function(e)
                {
                    this.isReady();
                },
                /** if selection exists and waiting for crop */
                isReady: function()
                {
                    var cropSize = {
                        height: this.crop.end.y - this.crop.begin.y,
                        width:  this.crop.end.x - this.crop.begin.x
                    };

                    var ready = (
                        (
                            this.toolbox.canvas.height != cropSize.height
                            ||
                            this.toolbox.canvas.width != cropSize.width
                        )
                        &&
                        (
                            cropSize.height > 0
                            &&
                            cropSize.width > 0
                        )
                    );

                    if (ready != this.lastReadyState) {
                        if (ready) {
                            this.$element.addClass('ready');
                        } else {
                            this.$element.removeClass('ready');
                        }

                        this.lastReadyState = ready;
                    }

                    return ready;
                }
            }),
            Undo: new Class({
                Extends: Tool,
                initialize: function()
                {
                    this.parent();

                    this.name = 'undo';

                    this.notAllowedForAutoReactivation = ['undo', 'redo', 'upload', 'drag', 'crop', 'save'];

                    /** images storage */
                    this.saves = [];
                    /* {
                        base64image: '...'
                        dimension:   {
                            height:  3,
                            width:   3
                        }
                    } */

                    /** DOM reference */
                    this.$element = Elements.from('<a href="#" class="tool undo-tool" title="Undo"></a>')[0];
                },
                init: function()
                {
                    var that = this;

                    this.$element.addEvent('click', function(){
                        that.toolbox.activateTool(that);
                    });

                    this.toolbox.$eventBox.addEvent('beginChange', function(){
                        that.createSave();
                    });
                    this.toolbox.$eventBox.addEvent('beginRedo', function(){
                        that.createSave();
                    });

                    this.updateFrontEnd();
                },
                activate: function()
                {
                    this.$element.addClass('active');

                    this.recoverSave();
                    this.updateFrontEnd();

                    var that = this;

                    setTimeout(function(){
                        if (
                            that.toolbox.lastActiveTool
                            && !that.notAllowedForAutoReactivation.contains(that.toolbox.lastActiveTool.name)
                            && that.toolbox.activateToolByName(that.toolbox.lastActiveTool.name)
                        ) {
                            //console.log ('[Info] Last tool reactivated');
                        } else {
                            that.toolbox.deactivateCurrentActiveTool();
                        }
                    }, 12);
                },
                deactivate: function()
                {
                    this.$element.removeClass('active');
                },
                /** Update button display */
                updateFrontEnd: function()
                {
                    if (this.saves.length > 0) {
                        // has saves
                        this.$element.removeClass('empty');
                    } else {
                        this.$element.addClass('empty');
                    }
                },
                /** recover recent image from saves */
                recoverSave: function()
                {
                    if (this.saves.length < 1) {
                        return false;
                    }

                    this.toolbox.$eventBox.fireEvent('beginUndo');

                    var save   = this.saves.pop(),
                        canvas = this.toolbox.canvas,
                        image  = new Image(),
                        ctx    = canvas.$element.getContext('2d');

                    image.onload = function()
                    {
                        {
                            canvas.setSize(save.dimension.width, save.dimension.height);

                            save = undefined;
                        }

                        ctx.drawImage(image, 0, 0);

                        image = undefined;
                    };

                    image.src = save.base64image;
                },
                /** make save from current canvas contents */
                createSave: function()
                {
                    this.saves.push({
                        base64image: this.toolbox.canvas.$element.toDataURL('image/png'),
                        dimension: {
                            height: this.toolbox.canvas.height,
                            width: this.toolbox.canvas.width
                        }
                    });

                    this.updateFrontEnd();
                }
            }),
            Redo: new Class({
                Extends: Tool,
                initialize: function()
                {
                    this.parent();

                    this.name = 'redo';

                    this.notAllowedForAutoReactivation = ['undo', 'redo', 'upload', 'drag', 'crop', 'save'];

                    /** images storage */
                    this.saves = [];

                    /** DOM reference */
                    this.$element = Elements.from('<a href="#" class="tool redo-tool" title="Redo"></a>')[0];
                },
                init: function()
                {
                    var that = this;

                    this.$element.addEvent('click', function(){
                        that.toolbox.activateTool(that);
                    });

                    this.toolbox.$eventBox.addEvent('beginUndo', function(){
                        that.createSave();
                    });

                    this.toolbox.$eventBox.addEvent('beginChange', function(){
                        that.clearSaves();
                    });

                    this.updateFrontEnd();
                },
                activate: function()
                {
                    this.$element.addClass('active');

                    this.recoverSave();
                    this.updateFrontEnd();

                    var that = this;

                    setTimeout(function(){
                        if (
                            that.toolbox.lastActiveTool
                                && !that.notAllowedForAutoReactivation.contains(that.toolbox.lastActiveTool.name)
                                && that.toolbox.activateToolByName(that.toolbox.lastActiveTool.name)
                            ) {
                            //console.log ('[Info] Last tool reactivated');
                        } else {
                            that.toolbox.deactivateCurrentActiveTool();
                        }
                    }, 12);
                },
                deactivate: function()
                {
                    this.$element.removeClass('active');
                },
                /** Update button display */
                updateFrontEnd: function()
                {
                    if (this.saves.length > 0) {
                        // has saves
                        this.$element.removeClass('empty');
                    } else {
                        this.$element.addClass('empty');
                    }
                },
                /** make save from current canvas contents */
                createSave: function()
                {
                    this.saves.push({
                        base64image: this.toolbox.canvas.$element.toDataURL('image/png'),
                        dimension: {
                            height: this.toolbox.canvas.height,
                            width:  this.toolbox.canvas.width
                        }
                    });

                    this.updateFrontEnd();
                },
                /** recover recent image from saves */
                recoverSave: function()
                {
                    if (this.saves.length < 1) {
                        return false;
                    }

                    this.toolbox.$eventBox.fireEvent('beginRedo');

                    var save   = this.saves.pop(),
                        canvas = this.toolbox.canvas,
                        image  = new Image(),
                        ctx    = canvas.$element.getContext('2d');

                    image.onload = function()
                    {
                        {
                            canvas.setSize(save.dimension.width, save.dimension.height);

                            save = undefined;
                        }

                        ctx.drawImage(image, 0, 0);

                        image = undefined;
                    };

                    image.src = save.base64image;
                },
                clearSaves: function()
                {
                    this.saves = [];

                    this.updateFrontEnd();
                }
            }),
            Brush: new Class({
                Extends: Tool,
                initialize: function()
                {
                    this.parent();

                    this.name = 'brush';

                    /** images storage */
                    this.saves = [];

                    /** DOM reference */
                    this.$element = Elements.from('<a href="#" class="tool brush-tool" title="Brush"></a>')[0];
                    /** where brush will paint on */
                    this.$canvas  = Elements.from('<canvas class="brush-tool-canvas"></canvas>')[0];
                    /** canvas draw context */
                    this.ctx      = this.$canvas.getContext('2d');
                },
                init: function()
                {
                    var that = this;

                    this.$element.addEvent('click', function(){
                        that.toolbox.activateTool(that);
                    });

                    this.$canvas.addEvent('mousedown', function(e){
                        if (e.rightClick) {
                            return;
                        }

                        e.preventDefault();

                        that.handleMouseDown(e);
                    });
                },
                activate: function()
                {
                    this.$element.addClass('active');

                    this.$canvas.inject(this.toolbox.canvas.$element.getParent(), 'top');

                    this.reset();
                },
                deactivate: function()
                {
                    this.$element.removeClass('active');

                    this.toolbox.canvas.$element.getParent().getElement('.brush-tool-canvas').dispose();
                },
                reset: function()
                {
                    this.mouse = {
                        x: -100,
                        y: -100
                    };

                    this.mousex = {
                        x: -100,
                        y: -100
                    };

                    this.mouseMoved = false;

                    this.$canvas.setProperties({
                        height: this.toolbox.canvas.height,
                        width:  this.toolbox.canvas.width
                    });

                    this.ctx.clearRect(0 , 0, this.toolbox.canvas.width, this.toolbox.canvas.height);
                },
                /** process mouse down */
                handleMouseDown: function(e)
                {
                    var that = this;

                    { // mouse move
                        var windowMouseMove = function(e){
                            that.handleMouseMove(e);
                        };
                        $(window).addEvent('mousemove', windowMouseMove);
                    }

                    { // mouse up
                        var windowMouseUp = function(e){
                            $(window).removeEvent('mouseup', windowMouseUp);
                            $(window).removeEvent('mousemove', windowMouseMove);

                            that.handleMouseUp(e);
                        };
                        $(window).addEvent('mouseup', windowMouseUp);
                    }

                    { // prepare mouse coordinates
                        var coordinates = this.$canvas.getCoordinates();

                        this.mouse.x  = e.event.pageX - coordinates.left;
                        this.mouse.y  = e.event.pageY - coordinates.top;

                        this.mousex   = Object.clone(this.mouse);
                    }

                    { // prepare ctx
                        this.ctx.lineWidth   = this.toolbox.data.lineWidth;
                        this.ctx.strokeStyle = this.toolbox.data.color;
                        this.ctx.lineCap     = 'round';
                        this.ctx.lineJoin    = 'round';
                    }
                },
                /** process mouse move */
                handleMouseMove: function(e)
                {
                    this.mouseMoved = true;

                    var mousex = Object.clone(this.mouse);

                    var coordinates = this.$canvas.getCoordinates();
                    this.mouse.x = e.event.pageX - coordinates.left;
                    this.mouse.y = e.event.pageY - coordinates.top;

                    this.ctx.beginPath();

                    this.ctx.moveTo(this.mousex.x, this.mousex.y);
                    this.ctx.lineTo(mousex.x, mousex.y);
                    this.ctx.lineTo(this.mouse.x, this.mouse.y);
                    this.ctx.stroke();

                    this.ctx.closePath();

                    this.mousex = Object.clone(mousex);
                },
                /** process mouse up */
                handleMouseUp: function(e)
                {
                    if (!this.mouseMoved) {
                        this.reset();
                        return false;
                    }

                    this.toolbox.$eventBox.fireEvent('beginChange');

                    this.toolbox.canvas.$element.getContext('2d').drawImage(this.$canvas, 0, 0, this.$canvas.width * ratio, this.$canvas.height * ratio);

                    this.reset();
                }
            }),
            Colors: new Class({
                Extends: Tool,
                initialize: function()
                {
                    this.parent();

                    this.name = 'colors';

                    this.currentColorIsDark = null;

                    /** DOM reference */
                    this.$element = Elements.from('<div class="tool colors-tool" ><input type="color" title="Color" /></div>')[0];

                    this.$elements = {
                        inputColor: this.$element.getElement('input[type="color"]')
                    };
                },
                init: function()
                {
                    var that = this;

                    this.$element.addEvent('click', function(){
                        that.toolbox.activateTool(that);
                    });

                    this.$elements.inputColor.addEvent('change', function(){
                        that.toolbox.data.color = this.value;
                        that.updateFrontend();
                    });

                    this.toolbox.data.color = '#FF0000';

                    this.clickCanvasCallback = function(e){
                        that.handleCanvasClick(e);
                    };

                    this.updateFrontend();
                },
                activate: function()
                {
                    this.$element.addClass('active');
                    this.toolbox.canvas.$element.addClass('colors-tool-canvas');

                    this.toolbox.canvas.$element.addEvent('click', this.clickCanvasCallback);
                },
                deactivate: function()
                {
                    this.$element.removeClass('active');
                    this.toolbox.canvas.$element.removeClass('colors-tool-canvas');

                    this.toolbox.canvas.$element.removeEvent('click', this.clickCanvasCallback);
                },
                updateFrontend: function()
                {
                    this.$element.setStyle('background-color', this.toolbox.data.color);

                    var isColorDark = this.isColorDark(this.toolbox.data.color);

                    do {
                        if (isColorDark === this.currentColorIsDark) {
                            // do nothing, same as last time
                            break;
                        } else {
                            this.currentColorIsDark = isColorDark;
                        }

                        if (isColorDark) {
                            this.$element.addClass('dark-color');
                        } else {
                            this.$element.removeClass('dark-color');
                        }
                    } while(false);
                },
                handleCanvasClick: function(e)
                {
                    var coordinates = this.toolbox.canvas.$element.getCoordinates();

                    var x = e.event.pageX - coordinates.left;
                    var y = e.event.pageY - coordinates.top;

                    var c = this.toolbox.canvas.$element.getContext('2d').getImageData(x * ratio, y * ratio, 1, 1).data;

                    this.toolbox.data.color = this.$elements.inputColor.value = this.rgbToHex(c[0], c[1], c[2]);
                    this.updateFrontend();
                },
                isColorDark: function(hexTripletColor) {
                    var color = hexTripletColor;

                    color = color.substring(1); // remove #

                    /** @link http://24ways.org/2010/calculating-color-contrast/ */
                    {
                        var r = parseInt(color.substr(0,2),16);
                        var g = parseInt(color.substr(2,2),16);
                        var b = parseInt(color.substr(4,2),16);
                        var yiq = ((r*299)+(g*587)+(b*114))/1000;
                    }

                    return !(yiq >= 128);
                },
                rgbToHex: function(r,g,b) {
                    var color = '#';

                    Array.each([r,g,b], function(v){
                        var c = v.toString(16);

                        if (v < 16) {
                            c = ['0', c].join('');
                        }

                        color += c;
                    });

                    return color;
                }
            }),
            Line: new Class({
                Extends: Tool,
                initialize: function()
                {
                    this.parent();

                    this.name = 'line';

                    var that = this;

                    /** DOM reference */
                    this.$element = Elements.from('<a href="#" class="tool line-tool arrow" title="Arrow / Line"></a>')[0];
                    /** DOM reference */
                    this.$canvas  = Elements.from('<canvas class="line-tool-canvas"></canvas>')[0];
                    /** canvas draw context */
                    this.ctx      = this.$canvas.getContext('2d');

                    /** prepare $canvas */
                    {
                        this.$canvas.addEvent('mousedown', function(e){
                            if (e.rightClick) {
                                return;
                            }

                            e.preventDefault();

                            that.handleMouseDown(e);
                        });
                    }

                    this.arrow = true; // if mode 'arrow'
                },
                init: function()
                {
                    var that = this;

                    this.reset();

                    this.$element.addEvent('click', function(){
                        if (that.isActive) {
                            that.toggleArrow();
                        } else {
                            that.toolbox.activateTool(that);
                        }
                    });
                },
                reset: function()
                {
                    /** mouse coordinates create line */
                    this.mouse = {
                        begin: {x: -100, y: -100},
                        end:   {x: -100, y: -100}
                    };

                    /** last values before new changes */
                    this.last = {
                        min: {x: 0, y: 0},
                        max: {x: 0, y: 0}
                    };

                    this.mouseMoved = false;

                    this.$canvas.setProperties({
                        height: this.toolbox.canvas.height,
                        width:  this.toolbox.canvas.width
                    });

                    this.ctx.clearRect(0 , 0, this.toolbox.canvas.width, this.toolbox.canvas.height);
                },
                activate: function()
                {
                    this.$element.addClass('active');

                    this.$canvas.inject(this.toolbox.canvas.$element.getParent(), 'top');

                    this.reset();
                },
                deactivate: function()
                {
                    this.$element.removeClass('active');

                    this.toolbox.canvas.$element.getParent().getElement('.line-tool-canvas').dispose();

                    this.reset();
                },
                /** process mouse down */
                handleMouseDown: function(e)
                {
                    var that = this;

                    $(window).removeEvent('keyup', this.keyUpCallback);

                    { // mouse move
                        var windowMouseMove = function(e){
                            that.handleMouseMove(e);
                        };
                        $(window).addEvent('mousemove', windowMouseMove);
                    }

                    { // mouse up
                        var windowMouseUp = function(e){
                            $(window).removeEvent('mouseup', windowMouseUp);
                            $(window).removeEvent('mousemove', windowMouseMove);

                            that.handleMouseUp(e);
                        };
                        $(window).addEvent('mouseup', windowMouseUp);
                    }

                    var coordinates = this.$canvas.getCoordinates();

                    this.mouse.begin.x = this.mouse.end.x = e.event.pageX - coordinates.left;
                    this.mouse.begin.y = this.mouse.end.y = e.event.pageY - coordinates.top;
                },
                /** process mouse move */
                handleMouseMove: function(e)
                {
                    var coordinates = this.$canvas.getCoordinates();

                    this.mouse.end.x = e.event.pageX - coordinates.left;
                    this.mouse.end.y = e.event.pageY - coordinates.top;

                    this.mouseMoved = true;

                    this.drawLine();
                },
                /** process mouse up */
                handleMouseUp: function(e)
                {
                    if (!this.mouseMoved) {
                        this.reset();
                        return false;
                    }

                    this.toolbox.$eventBox.fireEvent('beginChange');

                    this.toolbox.canvas.$element.getContext('2d').drawImage(this.$canvas, 0, 0, this.$canvas.width * ratio, this.$canvas.height * ratio);

                    this.reset();
                },
                /** redraw line from mouse coordinates */
                drawLine: function()
                {
                    var that = this;

                    var max = {
                        x: -4294967295,
                        y: -4294967295
                    };
                    var min = {
                        x: 4294967295,
                        y: 4294967295
                    };

                    // find max and min in mouse coordinates
                    Array.each(['begin', 'end'], function(p){
                        Array.each(['x', 'y'], function(c){
                            if (max[c] < that.mouse[p][c]) {
                                max[c] = that.mouse[p][c];
                            }
                            if (min[c] > that.mouse[p][c]) {
                                min[c] = that.mouse[p][c];
                            }
                        });
                    });

                    /** arrow data */
                    if (this.arrow) {
                        var arrow = {};

                        arrow.size = 13;
                        arrow.angle = Math.atan2(
                            this.mouse.end.y - this.mouse.begin.y,
                            this.mouse.end.x - this.mouse.begin.x
                        );
                        arrow.right = {
                            x: this.mouse.end.x - arrow.size * Math.cos(arrow.angle - Math.PI/9),
                            y: this.mouse.end.y - arrow.size * Math.sin(arrow.angle - Math.PI/9)
                        };
                        arrow.left = {
                            x: this.mouse.end.x - arrow.size * Math.cos(arrow.angle + Math.PI/9),
                            y: this.mouse.end.y - arrow.size * Math.sin(arrow.angle + Math.PI/9)
                        };
                    }

                    // clear
                    {
                        var lineWidth = this.toolbox.data.lineWidth;

                        if (this.arrow) {
                            lineWidth += arrow.size;
                        }

                        this.ctx.clearRect(
                            this.last.min.x - lineWidth,
                            this.last.min.y - lineWidth,
                            this.last.max.x - this.last.min.x + lineWidth * 2,
                            this.last.max.y - this.last.min.y + lineWidth * 2
                        );
                    }

                    /** draw */
                    {
                        this.ctx.beginPath();

                        this.ctx.moveTo(this.mouse.begin.x, this.mouse.begin.y);
                        this.ctx.lineTo(this.mouse.end.x, this.mouse.end.y);

                        if (this.arrow) {
                            this.ctx.moveTo(this.mouse.end.x, this.mouse.end.y);
                            this.ctx.lineTo(arrow.left.x, arrow.left.y);
                            this.ctx.lineTo(this.mouse.end.x, this.mouse.end.y);
                            this.ctx.lineTo(arrow.right.x, arrow.right.y);
                            this.ctx.lineTo(arrow.left.x, arrow.left.y);
                            this.ctx.lineTo(this.mouse.end.x, this.mouse.end.y);
                        }

                        this.ctx.lineWidth   = this.toolbox.data.lineWidth;
                        this.ctx.strokeStyle = this.toolbox.data.color;
                        this.ctx.fillStyle   = this.toolbox.data.color;
                        this.ctx.lineCap     = 'round';

                        this.ctx.fill();
                        this.ctx.stroke();

                        this.ctx.closePath();
                    }

                    this.last.min = Object.clone(min);
                    this.last.max = Object.clone(max);
                },
                toggleArrow: function(arrow)
                {
                    this.arrow = typeof arrow == 'undefined' ? !this.arrow : Boolean(arrow);

                    if (this.arrow) {
                        this.$element.addClass('arrow');
                    } else {
                        this.$element.removeClass('arrow');
                    }
                }
            }),
            Rectangle: new Class({
                Extends: Tool,
                initialize: function()
                {
                    this.parent();

                    this.name = 'rectangle';

                    /** DOM reference */
                    this.$element = Elements.from('<a href="#" class="tool rectangle-tool" title="Rectangle"></a>')[0];
                    /** DOM reference */
                    this.$canvas = Elements.from('<canvas class="rectangle-tool-canvas"></canvas>')[0];
                    /** canvas draw context */
                    this.ctx = this.$canvas.getContext('2d');
                    /** if fill drawn rectangle */
                    this.fill = false;

                    /** DOM reference, store all edit/resize divs */
                    this.$edit = Elements.from(
                        '<div class="rectangle-edit">'+
                            '<div class="resize resize-top"></div>'+
                            '<div class="resize resize-top-right"></div>'+
                            '<div class="resize resize-right"></div>'+
                            '<div class="resize resize-right-bottom"></div>'+
                            '<div class="resize resize-bottom"></div>'+
                            '<div class="resize resize-bottom-left"></div>'+
                            '<div class="resize resize-left"></div>'+
                            '<div class="resize resize-left-top"></div>'+
                        '</div>'
                    )[0];

                    this.disableAutoSaveForTools = ['redo'];
                },
                init: function()
                {
                    var that = this;

                    this.reset();

                    this.$element.addEvent('click', function(){
                        if (that.isActive) {
                            that.toggleFill();
                        } else {
                            that.toolbox.activateTool(that);
                        }
                    });

                    /** prepare $canvas */
                    {
                        this.$canvas.addEvent('mousedown', function(e){
                            if (e.rightClick) {
                                return;
                            }

                            e.preventDefault();

                            that.handleMouseDown(e);
                        });
                    }

                    /** prepare $edit */
                    {
                        this.$edit.addEvent('mousedown', function(e){
                            if (e.rightClick) {
                                return;
                            }

                            e.preventDefault();

                            that.handleEditMouseDown(e);
                        });

                        // here :relay() doesn't work, included mousedown also catches it
                        this.$edit.getElements('.resize').addEvent('mousedown', function(e){
                            if (e.rightClick) {
                                return;
                            }

                            e.preventDefault();
                            e.stopPropagation();

                            that.handleResizeMouseDown(e);
                        });
                    }
                },
                reset: function()
                {
                    /** mouse coordinates create rectangle */
                    this.mouse = {
                        begin: {x: -100, y: -100},
                        end:   {x: -100, y: -100}
                    };

                    /** previous mouse values (before new changes) */
                    this.last = {
                        min: {x: 0, y: 0},
                        max: {x: 0, y: 0}
                    };

                    this.mouseMoved = false;

                    this.$canvas.setProperties({
                        height: this.toolbox.canvas.height,
                        width:  this.toolbox.canvas.width
                    });

                    this.ctx.clearRect(0 , 0, this.toolbox.canvas.width, this.toolbox.canvas.height);

                    /** what parts are currently resize */
                    this.resizeMode = {
                        top:    false,
                        right:  false,
                        bottom: false,
                        left:   false
                    };

                    this.$edit.setStyle('display', 'none');
                    this.$edit.getElements('.resize').setProperty('style', '');

                    /** mouse position inside edit zone when begin drag */
                    this.editMouseDownShift = {
                        x: 0,
                        y: 0
                    };
                },
                activate: function()
                {
                    this.$element.addClass('active');

                    this.$edit.inject(this.toolbox.canvas.$element.getParent(), 'top');

                    this.$canvas.inject(this.toolbox.canvas.$element.getParent(), 'top');

                    this.reset();
                },
                deactivate: function()
                {
                    if (!this.disableAutoSaveForTools.contains(this.toolbox.pendingActivationTool.name)) {
                        this.save();
                    }

                    this.$element.removeClass('active');

                    this.toolbox.canvas.$element.getParent().getElement('.rectangle-tool-canvas').dispose();
                    this.toolbox.canvas.$element.getParent().getElement('.rectangle-edit').dispose();

                    this.reset();
                },
                toggleFill: function(fill)
                {
                    this.fill = typeof fill == 'undefined' ? !this.fill : Boolean(fill);

                    if (this.fill) {
                        this.$element.addClass('fill');
                    } else {
                        this.$element.removeClass('fill');
                    }
                },
                /** process mouse down */
                handleMouseDown: function(e)
                {
                    this.save();

                    var that = this;

                    $(window).removeEvent('keyup', this.keyUpCallback);

                    { // mouse move
                        var windowMouseMove = function(e){
                            that.handleMouseMove(e);
                        };
                        $(window).addEvent('mousemove', windowMouseMove);
                    }

                    { // mouse up
                        var windowMouseUp = function(e){
                            $(window).removeEvent('mouseup', windowMouseUp);
                            $(window).removeEvent('mousemove', windowMouseMove);

                            that.handleMouseUp(e);
                        };
                        $(window).addEvent('mouseup', windowMouseUp);
                    }

                    var coordinates = this.$canvas.getCoordinates();

                    this.mouse.begin.x = this.mouse.end.x = e.event.pageX - coordinates.left;
                    this.mouse.begin.y = this.mouse.end.y = e.event.pageY - coordinates.top;
                },
                /** process mouse move */
                handleMouseMove: function(e)
                {
                    var coordinates = this.$canvas.getCoordinates();

                    this.mouse.end.x = e.event.pageX - coordinates.left;
                    this.mouse.end.y = e.event.pageY - coordinates.top;

                    if (!this.mouseMoved) {
                        this.$edit.setStyle('display', '');
                    }

                    this.mouseMoved = true;

                    this.drawRectangle();
                },
                /** process mouse up */
                handleMouseUp: function(e)
                {
                    if (!this.mouseMoved) {
                        this.reset();
                        return false;
                    }

                    this.useFixedMouse();
                },
                save: function()
                {
                    if (!this.isReady())
                        return;

                    this.toolbox.$eventBox.fireEvent('beginChange');

                    this.toolbox.canvas.$element.getContext('2d').drawImage(this.$canvas, 0, 0, this.$canvas.width * ratio, this.$canvas.height * ratio);

                    this.reset();
                },
                /** redraw rectangle from mouse coordinates */
                drawRectangle: function()
                {
                    var that = this;

                    var fixedMouse = this.getFixedMouse();
                    var min = fixedMouse[0];
                    var max = fixedMouse[1];
                    var rectangleWidth  = max.x - min.x;
                    var rectangleHeight = max.y - min.y;

                    {
                        var lineWidth = this.toolbox.data.lineWidth;
                        var roundSize = 3;

                        this.ctx.clearRect(
                            this.last.min.x - lineWidth - roundSize,
                            this.last.min.y - lineWidth - roundSize,
                            this.last.max.x - this.last.min.x + (lineWidth + roundSize) * 2,
                            this.last.max.y - this.last.min.y + (lineWidth + roundSize) * 2
                        );

                        this.ctx.beginPath();

                        this.ctx.lineWidth   = lineWidth;
                        this.ctx.strokeStyle = this.toolbox.data.color;

                        if (this.fill) {
                            this.ctx.rect(min.x, min.y, rectangleWidth, rectangleHeight);

                            this.ctx.fillStyle = this.toolbox.data.color;
                            this.ctx.fill();
                        } else {
                            this.roundRect(this.ctx, min.x, min.y, rectangleWidth, rectangleHeight, roundSize);
                        }

                        this.ctx.stroke();

                        this.ctx.closePath();
                    }

                    {
                        this.$edit.setStyles({
                            left:   min.x +'px',
                            top:    min.y +'px',
                            width:  rectangleWidth  +'px',
                            height: rectangleHeight +'px'
                        });
                    }

                    this.last.min = Object.clone(min);
                    this.last.max = Object.clone(max);
                },
                roundRect: function (ctx, x, y, width, height, radius)
                {
                    ctx.moveTo(x + radius, y);
                    ctx.lineTo(x + width - radius, y);
                    ctx.quadraticCurveTo(x + width, y, x + width, y + radius);
                    ctx.lineTo(x + width, y + height - radius);
                    ctx.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
                    ctx.lineTo(x + radius, y + height);
                    ctx.quadraticCurveTo(x, y + height, x, y + height - radius);
                    ctx.lineTo(x, y + radius);
                    ctx.quadraticCurveTo(x, y, x + radius, y);
                },
                /** process mouse down resize */
                handleResizeMouseDown: function(e)
                {
                    var that = this;

                    { // mouse move
                        var windowMouseMove = function(e){
                            that.handleResizeMouseMove(e);
                        };
                        $(window).addEvent('mousemove', windowMouseMove);
                    }

                    { // mouse up
                        var windowMouseUp = function(e){
                            $(window).removeEvent('mouseup', windowMouseUp);
                            $(window).removeEvent('mousemove', windowMouseMove);

                            that.handleResizeMouseUp(e);
                        };
                        $(window).addEvent('mouseup', windowMouseUp);
                    }

                    this.resizeMode = {
                        top:    false,
                        right:  false,
                        bottom: false,
                        left:   false
                    };

                    var $r = e.target;

                    if ($r.hasClass('resize-top')) {
                        this.resizeMode.top     = true;
                    } else if ($r.hasClass('resize-right')) {
                        this.resizeMode.right   = true;
                    } else if ($r.hasClass('resize-bottom')) {
                        this.resizeMode.bottom  = true;
                    } else if ($r.hasClass('resize-left')) {
                        this.resizeMode.left    = true;
                    } else if ($r.hasClass('resize-top-right')) {
                        this.resizeMode.top     = true;
                        this.resizeMode.right   = true;
                    } else if ($r.hasClass('resize-right-bottom')) {
                        this.resizeMode.right   = true;
                        this.resizeMode.bottom  = true;
                    } else if ($r.hasClass('resize-bottom-left')) {
                        this.resizeMode.bottom  = true;
                        this.resizeMode.left    = true;
                    } else if ($r.hasClass('resize-left-top')) {
                        this.resizeMode.left    = true;
                        this.resizeMode.top     = true;
                    }
                },
                /** process mouse move resize */
                handleResizeMouseMove: function(e)
                {
                    var coordinates = this.$canvas.getCoordinates();

                    if (this.resizeMode.left) {
                        this.mouse.begin.x = e.event.pageX - coordinates.left;
                    }
                    if (this.resizeMode.right) {
                        this.mouse.end.x = e.event.pageX - coordinates.left;
                    }
                    if (this.resizeMode.top) {
                        this.mouse.begin.y = e.event.pageY - coordinates.top;
                    }
                    if (this.resizeMode.bottom) {
                        this.mouse.end.y = e.event.pageY - coordinates.top;
                    }

                    this.drawRectangle();
                },
                /** process mouse up */
                handleResizeMouseUp: function(e)
                {
                    this.isReady();
                },
                /** if selection exists and waiting for crop */
                isReady: function()
                {
                    this.useFixedMouse();

                    var editSize = {
                        height: this.mouse.end.y - this.mouse.begin.y,
                        width:  this.mouse.end.x - this.mouse.begin.x
                    };

                    return (editSize.height > 0 && editSize.width > 0);
                },
                /** Find correct mouse coord begin/min end/max  */
                getFixedMouse: function()
                {
                    var that = this;

                    var max = {
                        x: -4294967295,
                        y: -4294967295
                    };
                    var min = {
                        x: 4294967295,
                        y: 4294967295
                    };

                    // find max and min in mouse coordinates
                    Array.each(['begin', 'end'], function(p){
                        Array.each(['x', 'y'], function(c){
                            if (max[c] < that.mouse[p][c]) {
                                max[c] = that.mouse[p][c];
                            }
                            if (min[c] > that.mouse[p][c]) {
                                min[c] = that.mouse[p][c];
                            }
                        });
                    });

                    return [min, max];
                },
                useFixedMouse: function()
                {
                    var fixedMouse = this.getFixedMouse();

                    this.mouse.begin = fixedMouse[0];
                    this.mouse.end   = fixedMouse[1];
                },
                handleEditMouseDown: function(e)
                {
                    var that = this;

                    /** remember mouse shift on drag begin */
                    {
                        var left = parseInt(this.$edit.getStyle('left'));
                        this.editMouseDownShift.x = (isNaN(left) ? 0 : left) - e.event.clientX;

                        var top = parseInt(this.$edit.getStyle('top'));
                        this.editMouseDownShift.y = (isNaN(top) ? 0 : top) - e.event.clientY;
                    }

                    { // mouse move
                        var windowMouseMove = function(e){
                            that.handleEditMouseMove(e);
                        };
                        $(window).addEvent('mousemove', windowMouseMove);
                    }

                    { // mouse up
                        var windowMouseUp = function(e){
                            $(window).removeEvent('mouseup', windowMouseUp);
                            $(window).removeEvent('mousemove', windowMouseMove);

                            that.handleEditMouseUp(e);
                        };
                        $(window).addEvent('mouseup', windowMouseUp);
                    }
                },
                handleEditMouseMove: function(e)
                {
                    var left = e.event.clientX + this.editMouseDownShift.x;
                    var top  = e.event.clientY + this.editMouseDownShift.y;

                    var xDiff = this.mouse.begin.x - left;
                    this.mouse.begin.x -= xDiff;
                    this.mouse.end.x -= xDiff;

                    var yDiff = this.mouse.begin.y - top;
                    this.mouse.begin.y -= yDiff;
                    this.mouse.end.y -= yDiff;

                    this.drawRectangle();
                },
                handleEditMouseUp: function(e)
                {
                }
            }),
            Text: new Class({
                Extends: Tool,
                initialize: function()
                {
                    this.parent();

                    this.name = 'text';

                    /** DOM reference */
                    this.$element = Elements.from('<a href="#" class="tool text-tool" title="Text"></a>')[0];
                    /** cover canvas and listen user clicks */
                    this.$cover   = Elements.from('<div id="text-tool-cover"></div>')[0];
                    /** where user input text */
                    this.$editor  = Elements.from(
                        '<div id="text-editor">'+
                            '<div class="drag"></div>'+
                            '<textarea spellcheck="false"></textarea>'+
                        '</div>'
                    )[0];
                    /** frequently used elements */
                    this.$elements = {
                        drag:     this.$editor.getElement('.drag'),
                        textarea: this.$editor.getElement('textarea')
                    };
                },
                init: function()
                {
                    this.ctx = this.toolbox.canvas.$element.getContext('2d');

                    var that = this;

                    this.$element.addEvent('click', function(){
                        that.toolbox.activateTool(that);
                    });

                    this.$editor.addEvent('dblclick', function(e){
                        /**
                         * Prevent toolbox position reset and textarea text deselect
                         */
                        e.stopPropagation();
                    });

                    this.$cover.addEvent('click', function(e){
                        if (e.rightClick) {
                            return;
                        }

                        that.takeShot();
                        that.reset();

                        var coordinates = that.$cover.getCoordinates();

                        var x = e.event.pageX - coordinates.left;
                        var y = e.event.pageY - coordinates.top;

                        that.placeEditor(x, y);
                    });

                    this.$elements.textarea.addEvents({
                        keyup: function(){
                            that.fixTextarea();
                        },
                        keydown: function(){
                            that.fixTextarea();
                        },
                        blur: function(){
                            that.fixTextarea();
                        },
                        change: function(){
                            that.fixTextarea();
                        }
                    });

                    this.makeDraggable();
                },
                reset: function()
                {
                    this.$elements.textarea.set('value', '');
                    this.$elements.textarea.setAttribute('cols', '2');
                    this.$elements.textarea.setAttribute('rows', '2');
                    this.$elements.textarea.setAttribute('disabled', 'disabled');
                    this.$elements.textarea.setStyles({
                        color: this.toolbox.data.color,
                        'border-color': this.toolbox.data.color
                    });

                    this.ctx.fillStyle = this.toolbox.data.color;

                    this.$editor.setStyles({
                        top: '-100px',
                        left: '-100px',
                        display: 'none'
                    });

                    this.fixTextarea();
                },
                activate: function()
                {
                    this.$element.addClass('active');

                    this.$editor.inject(this.toolbox.canvas.$element.getParent(), 'top');
                    this.$cover.inject(this.toolbox.canvas.$element.getParent(), 'top');

                    this.reset();
                },
                deactivate: function()
                {
                    this.takeShot();

                    this.$element.removeClass('active');

                    this.toolbox.canvas.$element.getParent().getElement('#text-editor').dispose();
                    this.toolbox.canvas.$element.getParent().getElement('#text-tool-cover').dispose();

                    this.reset();
                },
                makeDraggable: function()
                {
                    var $target = this.$editor;
                    var $handle = this.$elements.drag;

                    // mouse position in handle on mousedown
                    var shift = {
                        x: 0,
                        y: 0
                    };

                    function elementMove(e) {
                        var left = e.event.clientX + shift.x;
                        var top  = e.event.clientY + shift.y;

                        $target.setStyle('left', left + 'px');
                        $target.setStyle('top', top + 'px');
                    }

                    function mouseUp() {
                        $(window).removeEvent('mousemove', elementMove);
                    }

                    function mouseDown(e) {
                        if (e.rightClick) {
                            return;
                        }

                        var left = parseInt($target.getStyle('left'));
                        shift.x = (isNaN(left) ? 0 : left) - e.event.clientX;

                        var top = parseInt($target.getStyle('top'));
                        shift.y = (isNaN(top) ? 0 : top) - e.event.clientY;

                        mouseUp();
                        $(window).addEvent('mousemove', elementMove);

                        e.preventDefault();
                    }

                    $handle.addEvent('mousedown', mouseDown);
                    $(window).addEvent('mouseup', mouseUp);

                    $(window).addEvent('resize', function(){
                        var left = parseInt($target.getStyle('left'));
                        var top  = parseInt($target.getStyle('top'));

                        $target.setStyle('left', left + 'px');
                        $target.setStyle('top', top + 'px');
                    });
                },
                takeShot: function()
                {
                    var text = this.$elements.textarea.get('value').trim();

                    if (text.length < 1) {
                        return;
                    }

                    var pos  = {
                        x: parseInt(this.$editor.getStyle('left')) + 3,
                        y: parseInt(this.$editor.getStyle('top')) + 15 + parseInt(1 / ratio)
                    };

                    this.toolbox.$eventBox.fireEvent('beginChange');

                    this.ctx.font = "bold "+ (14 * ratio) +"px monospace";

                    var that = this,
                        lineHeight = 16,
                        count = 0;

                    Array.each(text.split("\n"), function(line){
                        that.ctx.fillText(line, pos.x * ratio, (pos.y + (count * lineHeight)) * ratio);
                        count++;
                    });
                },
                placeEditor: function(x, y)
                {
                    this.$editor.setStyles({
                        top:  (y - 12) +'px',
                        left: (x - 4) +'px',
                        display: ''
                    });

                    this.$elements.textarea.removeAttribute('disabled');
                    this.$elements.textarea.focus();
                },
                fixTextarea: function()
                {
                    var cols, colsPlus = 2, text = this.$elements.textarea.get('value').split("\n");

                    this.$elements.textarea.setAttribute('rows', text.length + 1);

                    cols = colsPlus;

                    Array.each(text, function(line){
                        if (line.length > cols - colsPlus) {
                            cols = line.length + colsPlus;
                        }
                    });

                    this.$elements.textarea.setAttribute('cols', cols);
                    this.$elements.textarea.setStyle('width', cols +'ch'); // cols differs from font size
                }
            })
        };

        function main(){
            var toolbox = new Toolbox();
            toolbox.addTool(new Tools.Drag());
            toolbox.addTool(new Tools.Crop());
            toolbox.addTool(new Tools.Brush());
            toolbox.addTool(new Tools.Line());
            toolbox.addTool(new Tools.Rectangle());
            toolbox.addTool(new Tools.Text());
            toolbox.addTool(new Tools.Colors());
            toolbox.addTool(new Tools.Undo());
            toolbox.addTool(new Tools.Redo());
            toolbox.addTool(new Tools.Save());
            toolbox.addTool(new Tools.Upload()); 

            toolbox.init();
        }

        var mainCanvas = new Canvas();
    }

    /**
     * Commands that should run only once
     */
    var cmdOnlyOnce = {};

    chrome.extension.onMessage.addListener(function(m, sender, sendResponse)
    {
        switch (m.cmd) {
            case 'edit:ready':
                if (typeof cmdOnlyOnce[m.cmd] != 'undefined') {
                    console.log ('This command can run only once');
                    return;
                }

                if (!m.imageObjectUrl) {
                    $$('#image-wrapper').setStyle('display', 'none');
                    return false;
                } else {
                    $$('#screensaver').setStyle('display', 'none');
                    $$('#image-wrapper').setStyle('display', '');

                    imageObjectUrl = m.imageObjectUrl;
                    start_editor();
                }

                cmdOnlyOnce[m.cmd] = true;
                break;
        }
    });

    sendMessage({
        cmd: 'bg:edit:ready'
    });
});
