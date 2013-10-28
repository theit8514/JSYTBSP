var SCREENLOADTHREADSHOLD = 1500;
var RESORTDELAY = 3000;
var ytbsp_debug = false;
var CHANNELPREFIX = 'http://www.youtube.com/channel/';
var screenTop, screenBottom;
var localdata = {};
var activechannels;
var mychanneldata;
var resortTimeout = null;
var subList;
var ytbsp_failures = 0;
var ytbsp_first = false;
var ytbsp_loading = true;
if (navigator.userAgent.toLowerCase().indexOf('firefox') > -1) ytbsp_first = true;
var statusDiv;
var statusTimeout = null;
var statusAnimating = false;

function clog(m) { console.log(m); }
function cdebug(m) { if (ytbsp_debug) console.log(m); }
function status(m) {
    if (statusDiv.is(":animated")) {
        if (statusAnimating === false) {
            statusDiv.stop();
        }
    }
    statusAnimating = true;
    statusDiv.text(m);
    statusDiv.animate({ 'margin-top': 0 }, 600, "swing");
    if (statusTimeout !== null) clearTimeout(statusTimeout);
    statusTimeout = setTimeout(function () {
        statusAnimating = false;
        statusDiv.animate({ 'margin-top': -25 }, 600, "swing", function () { statusDiv.text(""); });
    }, 2000);
}

function updateSubs(channel, buildlist, showimages) {
    if (ytbsp_loading) return;
    if (buildlist === undefined) buildlist = true;
    if (showimages === undefined) showimages = true;
    if (channel === undefined) channel = null;
    var func = function (i, c) {
        if (buildlist || c.needsUpdate) {
            log("Building list for channel " + c.title);
            c.buildList();
        }
        if (c.inView()) {
            // old ytbsp had update code here, not needed in this version as we have all the data required.
            if (showimages) {
                var undone = $("img[data-src]", c.videoList, true);
                if (undone.length > 0) {
                    console.log("Unhiding video images for channel " + c.title);
                    undone.each(function (i, image) {
                        image.src = image.getAttribute("data-src");
                        image.removeAttribute("data-src");
                    });
                }
            }
        }
    };
    if (!channel) {
        $.each(activechannels, func);
    } else {
        func(0, channel);
    }
}

function resortSubs() {
    //setTimeout(handleResort, 10)
    handleResort(false);
}

function handleResort(immediate) {
    if (isMissing(immediate)) immediate = false;
    var sortsubs = !localRead("sortsubs");
    var sort = sortsubs ? "data-title" : "data-uploaded";
    var dir = sortsubs ? "asc" : "desc";
    console.log("sort=" + sort + " dir=" + dir);
    //params.sortOnLoad = [sort, dir];
    //$("#ytbsp-subs").mixitup(params);
    //$("#ytbsp-subs>li").tsort({ attr: sort, order: dir });

    var unsorted = [];
    $("#ytbsp-subs li.ytbsp-subscription").each(function (i) {
        var meta = { sortKey: $(this).attr(sort), sortKey2: $(this).attr("data-absolute"), title: $(this).attr("data-title"), index: i, elem: $(this), sorted: false };
        if (isMissing(meta.sortKey)) meta.sortKey = 0;
        unsorted.push(meta);
    });

    var sorted = unsorted.slice();

    function compare(a, b) {
        var sortAttrA = isNaN(a.sortKey * 1) ? a.sortKey.toLowerCase() : a.sortKey * 1,
            sortAttrB = isNaN(b.sortKey * 1) ? b.sortKey.toLowerCase() : b.sortKey * 1;
        if (sortAttrA < sortAttrB)
            return dir == "asc" ? -1 : 1;
        if (sortAttrA > sortAttrB)
            return dir == "asc" ? 1 : -1;
        sortAttrA = isNaN(a.sortKey2 * 1) ? a.sortKey2.toLowerCase() : a.sortKey2 * 1;
        sortAttrB = isNaN(b.sortKey2 * 1) ? b.sortKey2.toLowerCase() : b.sortKey2 * 1;
        if (sortAttrA < sortAttrB)
            return dir == "asc" ? -1 : 1;
        if (sortAttrA > sortAttrB)
            return dir == "asc" ? 1 : -1;
        var tA = a.title.toLowerCase();
        var tB = b.title.toLowerCase();
        return tA > tB ? 1 : -1;
    };

    sorted.sort(compare);

    //console.log(sorted);

    var changed = false;
    if (immediate) {
        $.each(sorted, function (i, item) {
            item.elem.appendTo(item.elem.parent());
        });
        return;
    }

    // Well, I think this is the best I can do. It does have to sort 3 times occasionally due to
    // trying to block "microjumps", which looks absolutely stupid with the animation,
    // but I don't think that is too much of an issue. Sorting is fluid, smooth, and works great.
    console.log($.map(sorted, function (e) { return e.title; }));
    var p = $("#ytbsp-subs");
    console.log($.map(sorted, function (e, i) {
        if (i == e.index) return null;
        return e.index + " -> " + i;
    }));
    sortItemsUp(sorted, p, false);
    console.log($.map(sorted, function (e, i) {
        if (i == e.index) return null;
        return e.index + " -> " + i;
    }));
    sortItemsDown(sorted, p);
    // If there are still changes that have not been made, run through the sortItemsUp procedure one more time
    // This time with microjumps enabled to allow items to move up by one index.
    if ($.map(sorted, function (e, i) { if (i === e.index) return null }).length > 0) {
        console.log($.map(sorted, function (e, i) {
            if (i == e.index) return null;
            return e.index + " -> " + i;
        }));
        sortItemsUp(sorted, p, true);
    }

    // We need to removed the moved class from these elements.
    p.children(".ytbsp-subscription-moved").removeClass("ytbsp-subscription-moved");

    // At this point sorted should have each element at i === sorted[i].index;
    windowScroll();
}

function sortItemsUp(sorted, p, micro) {
    for (var i = 0; i < sorted.length; i++) {
        var wantsToBe = sorted[i];
        var wantsToBeAt = i;
        var currentlyAt = wantsToBe.index;
        if (wantsToBe.sorted) {
            continue;
        }
        // If this item was sorted in place then we do not need to proceed.
        if (wantsToBeAt === currentlyAt) continue;

        if (currentlyAt <= wantsToBeAt) {
            continue;
        }
        // Don't detect microjumps IE: An element is moving down multiple places, but there are several corresponding one-place movements up.
        // Microjumps will be handled in the sortItemsDown method (items that the down movement displaces will be decremented up).
        if (!micro && currentlyAt - wantsToBeAt === 1) {
            if (i < sorted.length - 1 && sorted[i + 1].index - (i + 1) !== 0) {
                console.log("Skip microjump for index " + currentlyAt + " (" + wantsToBe.title + ")");
                continue;
            }
        }
        console.log("Sub currently at index " + currentlyAt + " (" + wantsToBe.title + ") wants to move up to " + wantsToBeAt);

        // Update indexes that are greater than or equal to wantsToBeAt and less than currentlyAt
        // Ex, moving 5 to 1, 1 to 4 should be incremented.
        for (var j = 0; j < sorted.length; j++) {
            var ti = sorted[j];
            if (ti.index >= wantsToBeAt && ti.index < currentlyAt) ti.index++;
        }

        // Move the item from currentlyAt to wantsToBeAt
        wantsToBe.index = wantsToBeAt;

        // Now the items are in the correct order, we can place the current item where we want it.
        var myItem = wantsToBe.elem;
        // I'm still not exactly sure why this needs to be wantsToBeAt - 1 but it works.
        var targetItem = p.children(".ytbsp-subscription").not('.ytbsp-subscription-moved').eq(wantsToBeAt);
        wantsToBe.sorted = true;
        wantsToBe.elem.addClass("ytbsp-subscription-moved");
        var li = $("<li class='ytbsp-subscription ytbsp-subscription-placeholder'>Placeholder for " + wantsToBe.elem.attr("data-title") + "</li>").insertBefore(targetItem);
        //$("<span>Moved</span>").insertAfter($(".ytbsp-subtitle", myItem));
        myItem.data("targetItem", li);
        //myItem.insertBefore(targetItem);
        myItem.slideUp(400, function () {
            // Use this and datafield to prevent function in loop issues.
            var $t = $(this);
            var tti = $t.data("targetItem");
            $t.insertBefore(tti).slideDown(400, function () {
                tti.remove();
            });
        });
    }
}

function sortItemsDown(sorted, p) {
    for (var i = sorted.length - 1; i >= 0; i--) {
        var wantsToBe = sorted[i];
        var wantsToBeAt = i;
        var currentlyAt = wantsToBe.index;
        if (wantsToBe.sorted) {
            continue;
        }
        // If this item was sorted in place then we do not need to proceed.
        if (wantsToBeAt === currentlyAt) continue;

        if (currentlyAt >= wantsToBeAt)
            continue;
        console.log("Sub currently at index " + currentlyAt + " (" + wantsToBe.title + ") wants to move down to " + wantsToBeAt);

        // Update indexes that are less than or equal to wantsToBeAt and greater than currentlyAt
        // Ex, moving 0 to 1, 1 should be updated to 0.
        for (var j = 0; j < sorted.length; j++) {
            var ti = sorted[j];
            if (ti.index <= wantsToBeAt && ti.index > currentlyAt) ti.index--;
        }

        // Move the item from currentlyAt to wantsToBeAt
        wantsToBe.index = wantsToBeAt;

        // Now the items are in the correct order, we can place the current item where we want it.
        var myItem = wantsToBe.elem;
        // Find the target index in the children of the list, skipping any object that has moved or is this current object.
        var targetItem = p.children(".ytbsp-subscription").not('.ytbsp-subscription-moved').not(myItem).eq(wantsToBeAt);
        wantsToBe.sorted = true;
        wantsToBe.elem.addClass("ytbsp-subscription-moved");
        var li = $("<li class='ytbsp-subscription ytbsp-subscription-placeholder'>Placeholder for " + wantsToBe.elem.attr("data-title") + "</li>").insertBefore(targetItem);
        //$("<span>Moved</span>").insertAfter($(".ytbsp-subtitle", myItem));
        myItem.data("targetItem", li);
        //myItem.insertBefore(targetItem);
        myItem.slideUp(400, function () {
            // Use this and datafield to prevent function in loop issues.
            var $t = $(this);
            var tti = $t.data("targetItem");
            $t.insertBefore(tti).slideDown(400);
            tti.remove();
        });
    }

}

//#region User Interface Screens

function makeBlobUrl(str) {
    var url = window.webkitURL || window.URL;
    var bb = new Blob([str], { type: 'text/plain' });
    return url.createObjectURL(bb);
}

function makeGlobalBackupOptions(content) {
    // Export
    var allvideos = $.map(activechannels, function (channel) { return channel.videos; });
    var backup = $.map(allvideos, function (video) { return video.makeSave(); });
    var str = JSON.stringify({ "format": "ytbsp_1.0", "data": backup });
    var url = makeBlobUrl(str);
    var dl = document.createElement('input');
    var dla = document.createElement('a');
    dl.type = "button";
    dl.value = "Export backup";
    dla.download = "YTBSP_v1_Export.txt";
    dla.href = url;
    dla.appendChild(dl);
    content.appendChild(dla);

    // Import
    var ip = document.createElement('input');
    ip.type = "file";
    ip.id = "import";
    ip.name = "files[]";
    ip.style.display = 'none';
    var ipb = document.createElement('input');
    ipb.type = 'button';
    ipb.id = 'importbutton';
    ipb.value = "Import backup";
    $(ipb).click(function () {
        $(ip).click();
    });
    var ips = document.createElement('span');
    ip.addEventListener('change', function (evt) {
        var files = evt.target.files;
        var file = files[0];
        var reader = new FileReader();
        reader.onloadend = function () {
            log(this.result);
            try {
                var obj = JSON.parse(this.result);
                if (isMissing(obj)) throw "Not valid JSON format";
                var noseen = 0;
                var noremoved = 0;
                var formatFound = false;
                if (obj.format === "ytbsp_1.0") {
                    formatFound = true;
                    // Original format, parse data as an array of all videos.
                    $.each(obj.data, function (i, vid) {
                        var videoId = vid.videoId;
                        var seen = vid.seen;
                        var removed = vid.removed;
                        var target = $.grep(allvideos, function (k) { return k.videoId === videoId; });
                        // If we don't have this video on the list, skip it.
                        if (isMissing(target)) return;
                        if (target.length === 0) return;
                        target = target[0];
                        if (!target.seen && seen) {
                            target.see();
                            noseen++;
                        }
                        if (!target.removed && removed) {
                            target.remove();
                            noremoved++;
                        }
                    });
                } else if (obj.format === "ytbsp_2.0") { // Future planning?
                    //formatFound = true;
                } // Add other formats here.

                // We did not find a format. We should check to see if someone is importing their original YTBSP backup.
                if (!formatFound) {
                    try {
                        // 0 === removed and 1 === seen.
                        $.each(obj, function (videoId, val) {
                            var target = $.grep(allvideos, function (k) { return k.videoId === videoId; });
                            if (isMissing(target)) return;
                            if (target.length === 0) return;
                            target = target[0];
                            if (val === 0 && !target.removed) {
                                target.remove();
                                noremoved++;
                            } else if (val === 1 && !target.seen) {
                                target.see();
                                noseen++;
                            }
                        });
                        // If we didn't get any errors, then I'd say we were pretty successful.
                        formatFound = true;
                    } catch (e) {
                    }
                }

                if (!formatFound) {
                    // Unknown format...
                    throw "Unknown format";
                }
                saveYTBSPcache();
                ips.textContent = "Import Successful, marked " + noseen + " seen and " + noremoved + " removed";
                updateSubs();
            } catch (e) {
                console.error(e);
                if (e === "Not valid JSON format") {
                    ips.textContent = "Import failed, input file was not a valid JSON format.";
                } else if (e === "Unknown format") {
                    ips.textContent = "Import failed, the backup format could not be identified.";
                } else {
                    ips.textContent = "Import failed, unknown error occurred: " + e;
                }
            }
        };
        reader.readAsText(file);
    }, false);
    content.appendChild(ip);
    content.appendChild(ipb);
    content.appendChild(ips);
}

function makeGlobalUnremoveOptions(content) {
    var s1 = document.createElement('span');
    $(s1).click(function () {
        $.each(activechannels, function (i, channel) { channel.unremoveAll(); });
        saveYTBSPcache();
    }).text("Unremove all").addClass("func func-dark unremoveall");

    var s2 = document.createElement('span');
    $(s2).click(function () {
        $.each(activechannels, function (i, channel) { channel.reset(); });
        saveYTBSPcache();
    }).text("Reset all").addClass("func func-dark resetall");

    content.appendChild(s1);
    content.appendChild(document.createTextNode("  "));
    content.appendChild(s2);
}

function makeGlobalDisplayOptions(content) {
    var tbl = table(content);
    tbl.style.width = "100%";
    tbl.border = 0;
    var row = tr(tbl);
    var cell = td(row);
    var i1 = input("checkbox", "func func-dark sort");
    i1.checked = localRead("sortsubs");
    var s1 = span("  Sort subscriptions by last upload date");
    var f1 = function () {
        var val = !localRead("sortsubs");
        localWrite("sortsubs", val);
        i1.checked = val;
        handleResort(true);
    };
    $(i1).click(f1);
    $(s1).click(f1);
    cell.appendChild(i1);
    cell.appendChild(s1);

    cell = td(row);
    var i2 = input("checkbox", "func func-dark resort");
    i2.checked = localRead("resort");
    var s2 = span("  Auto re-sort subscriptions after 5 seconds.");
    var f2 = function () {
        var val = !localRead("resort");
        localWrite("resort", val);
        i2.checked = val;
    };
    $(i2).click(f2);
    $(s2).click(f2);
    cell.appendChild(i2);
    cell.appendChild(s2);

    row = tr(tbl);
    cell = td(row);
    var i3 = input("checkbox", "func func-dark hidesubs");
    i3.checked = !localRead("hidesubs");
    var s3 = span("  Hide empty subscriptions");
    var f3 = function () {
        var val = !localRead("hidesubs");
        localWrite("hidesubs", val);
        i3.checked = !val;
    };
    $(i3).click(f3);
    $(s3).click(f3);
    cell.appendChild(i3);
    cell.appendChild(s3);

    cell = td(row);
    var i4 = input("checkbox", "func func-dark hideseen");
    i4.checked = localRead("hideseen");
    var s4 = span("  Hide videos that have been seen. Affects sorting of subs if enabled.");
    var f4 = function () {
        var val = !localRead("hideseen");
        localWrite("hideseen", val);
        i4.checked = val;
    };
    $(i4).click(f4);
    $(s4).click(f4);
    cell.appendChild(i4);
    cell.appendChild(s4);

    span("New Window Behavior: ", content);
    var nw = document.createElement("select");
    nw.id = "nw";
    nw.class = "func select";
    content.appendChild(nw);
    nw.style.width = "300px";
    var op;

    op = document.createElement("option");
    op.setAttribute("value", "_blank");
    $(op).text("Always in a new window.");
    nw.appendChild(op);

    op = document.createElement("option");
    op.setAttribute("value", "ytbsp_window");
    $(op).text("Open a single new window and reuse it.");
    nw.appendChild(op);

    op = document.createElement("option");
    op.setAttribute("value", "");
    $(op).text("Open in current window.");
    nw.appendChild(op);

    var val = localRead("target") || "ytbsp_window";
    $("option", nw).filter(function () {
        return $(this).val() === val;
    }).prop('selected', true);

    $(nw).change(function () {
        var newTarget = $("option:selected", nw).val();
        localWrite("target", newTarget);
        var allVideos = $.map(activechannels, function (channel) { return channel.videos; });
        $.each(allVideos, function (k, item) { item.updateTarget(newTarget); });
    });

    br(content);
    span("Video Display: ", content);
    var vd = document.createElement("select");
    vd.id = "vd";
    vd.class = "func select";
    content.appendChild(vd);
    vd.style.width = "500px";

    op = document.createElement("option");
    op.setAttribute("value", "normal");
    $(op).text("The normal video watch page (inc. comments, suggestions, etc)");
    vd.appendChild(op);

    op = document.createElement("option");
    op.setAttribute("value", "embed");
    $(op).text("The embedded Youtube player (video takes up full size of window)");
    vd.appendChild(op);

    val = localRead("display") || "embed";
    $("option", vd).filter(function () {
        return $(this).val() === val;
    }).prop('selected', true);

    $(vd).change(function () {
        var newvd = $("option:selected", vd).val();
        localWrite("display", newvd);
        var oldvq = localRead("highdef");
        var allVideos = $.map(activechannels, function (channel) { return channel.videos; });
        $.each(allVideos, function (k, item) { item.updateUrl(newvd, oldvq); });
    });

    br(content);
    span("Video Quality: ", content);
    var vq = document.createElement("select");
    vq.id = "vq";
    vq.class = "func select";
    content.appendChild(vq);
    vq.style.width = "500px";

    op = document.createElement("option");
    op.setAttribute("value", "");
    $(op).text("Let YouTube decide (no vq option added to URL)");
    vq.appendChild(op);

    op = document.createElement("option");
    op.setAttribute("value", "hd1080");
    $(op).text("1080p (if available)");
    vq.appendChild(op);

    op = document.createElement("option");
    op.setAttribute("value", "hd720");
    $(op).text("720p (if available)");
    vq.appendChild(op);

    op = document.createElement("option");
    op.setAttribute("value", "large");
    $(op).text("480p");
    vq.appendChild(op);

    op = document.createElement("option");
    op.setAttribute("value", "medium");
    $(op).text("360p");
    vq.appendChild(op);

    op = document.createElement("option");
    op.setAttribute("value", "small");
    $(op).text("240p");
    vq.appendChild(op);

    val = localRead("highdef") || "";
    $("option", vq).filter(function () {
        return $(this).val() === val;
    }).prop('selected', true);

    $(vq).change(function () {
        var newvq = $("option:selected", vq).val();
        localWrite("highdef", newvq);
        var oldvd = localRead("display");
        var allVideos = $.map(activechannels, function (channel) { return channel.videos; });
        $.each(allVideos, function (k, item) { item.updateUrl(oldvd, newvq); });
    });

}

function makeRename(channel) {
    var content = document.createElement('div');
    var header = document.createElement('h1');
    header.textContent = "Rename channel";
    content.appendChild(header);

    var text = document.createElement('p');
    $(text).text("Have 10 friends all named Bob? Use the rename feature to identify them. Rename associates the channel ID" +
        " of the channel with the new title, so it will stick even when the channel changes it.");
    content.appendChild(text);

    content.appendChild(document.createElement("br"));

    text = document.createElement('p');
    var textdata = "Channel ID is " + channel.channelId + ".";
    if (channel.oldtitle) {
        textdata = textdata + " Channel was renamed previously to " + channel.title + ".";
        textdata = textdata + " Channel currently has the title of " + channel.oldtitle + ".";
    } else {
        textdata = textdata + " Channel has not been renamed from it's current title of " + channel.title + ".";
    }
    $(text).text(textdata);
    content.appendChild(text);

    content.appendChild(document.createElement("br"));

    text = document.createElement('p');
    $(text).text("What would you like the channel's title to be? (enter blank value to undo renaming)");
    content.appendChild(text);

    var input = document.createElement('input');
    input.type = "text";
    input.value = channel.title;
    content.appendChild(input);

    var btn = document.createElement('input');
    btn.type = "button";
    btn.value = "Rename";
    $(btn).click(function () {
        var renamelist = localRead("rename", {});
        var val = input.value;
        var titleObj = $(".ytbsp-subtitle a", channel.row);
        if (val === "") {
            renamelist[channel.channelId] = null;
            if (channel.oldtitle) {
                channel.title = channel.oldtitle;
            }
        } else {
            renamelist[channel.channelId] = input.value;
            channel.title = input.value;
        }
        titleObj.text(channel.title);
        localWrite("rename", renamelist);
        closeModal();
    });
    content.appendChild(btn);

    btn = document.createElement('input');
    btn.type = "button";
    btn.value = "Cancel";
    $(btn).click(function () {
        closeModal();
    });
    content.appendChild(btn);

    modal(content, input);
}

function makeGlobalOptions() {
    var content = div();
    h1("Global Options", content);
    br(content);
    h2("Export/Import", content);
    br(content);
    p("This feature allows you to export and import video seen/removed information. Exporting is pretty standard." +
        " Importing will only import videos seen/removed status, it will not unset seen/removed." +
        " You can also import from the old version of the YTBSP which is a GreaseMonkey userscript.", content);
    makeGlobalBackupOptions(content);

    br(content);
    br(content);
    h2("Unremove all videos", content);
    br(content);
    p("This option will mark all videos as unremoved. If the first option is used, the seen option will be retained." +
        "If the video was seen before, it will remain seen. The second option resets both seen and removed status for" +
        "all current videos. You should probably use the Export option above before using this.", content);
    br(content);
    makeGlobalUnremoveOptions(content);

    br(content);
    br(content);
    h2("General Display Options", content);
    br(content);
    makeGlobalDisplayOptions(content);

    modal(content);
}

function makeChannelOptions(channel) {

}

//#endregion

function ytbsp_load() {
    clog("ytbsp_load called");
    statusDiv = $("#ytbsp-status");
    status("YTBSP Loading...");
    subList = $("#ytbsp-subs")[0];
    screenTop = 0;
    screenBottom = screenTop + window.innerHeight;
    divWidth = $(subList).width() - 10;
    numberOfItems = Math.floor(divWidth / videoWidth);
    cdebug("divWidth: " + divWidth + " #i: " + numberOfItems);
    localLoad();
    $("#ytbsp-modal-darken").click(function (e) {
        if (e.target === this || /close\-modal/.test(e.target.className)) {
            closeModal();
        }
    });
    // Load in my channel and the channels that I have subscribed.
    var mychannel = loadMyChannel();
    var allchannels = loadAllChannels();
    clog("Channels load initiated.");
    $.when(mychannel, allchannels).done(ytbsp_channelsloaded);
}

function ytbsp_channelsloaded(myresp, allresp) {
    clog("Channels loaded.");
    status("Subscriptions gathered, processing...");
    mychanneldata = myresp;
    activechannels = allresp;
    var channelarr = {};
    $.each(allresp, function (i, co) { channelarr[co.channelId] = co; });
    var cachedChannels = localRead("chancache", []);
    var renamelist = localRead("rename", {});
    $.each(cachedChannels, function (i, e) {
        var channelId = e.channelId;
        var chan = channelarr[channelId];
        if (isMissing(chan)) return;
        chan.found = true;
        chan.playlistId = e.playlistId;
        chan.title = e.title;
        chan.image = e.image;
        var renameto = renamelist[e.channelId];
        if (!isMissing(renameto)) {
            chan.oldtitle = chan.title;
            chan.title = renameto;
        }
    });
    var toLoadData = {};
    var toLoad = 0;
    $.each(allresp, function (i, co) {
        if (co.found) return;
        toLoadData[co.channelId] = co;
        toLoad++;
    });

    // ReSharper disable ConditionIsAlwaysConst
    // ReSharper disable HeuristicallyUnreachableCode
    if (toLoad === 0) {
        // We already know of all our channels, no need to call the load.
        ytbsp_channeldataloaded();
    } else {
        var channeldata = loadChannelData(toLoadData);
        channeldata.done(ytbsp_channeldataloaded);
    }
    // ReSharper restore HeuristicallyUnreachableCode
    // ReSharper restore ConditionIsAlwaysConst
}

function ytbsp_channeldataloaded() {
    clog("Channel data loaded.");
    status("Subscription data processed.");
    var cachedarr = {};
    var cachedChannels = localRead("chancache", []);
    $.each(cachedChannels, function (i, co) { cachedarr[co.channelId] = co; });
    $.each(activechannels, function (i, co) {
        var channelId = co.channelId;
        var chan = cachedChannels[channelId];
        if (!chan) {
            cachedarr[channelId] = {
                channelId: co.channelId,
                playlistId: co.playlistId,
                title: co.oldtitle ? co.oldtitle : co.title,
                image: co.image
            };
        } else {
            chan.playlistId = co.playlistId;
            chan.title = co.oldtitle ? co.oldtitle : co.title;
            chan.image = co.image;
        }
    });
    var cachedarr2 = [];
    $.each(cachedarr, function (i, co) {
        cachedarr2.push(co);
    });
    localWrite("chancache", cachedarr2);
    getNewVideos(true);
}

//function beginRequests() {
//    subList = $("#ytbsp-subs")[0];
//    screenTop = 0;
//    screenBottom = screenTop + window.innerHeight;
//    divWidth = $(subList).width() - 10;
//    numberOfItems = Math.floor(divWidth / videoWidth);
//    console.log("divWidth: " + divWidth + " #i: " + numberOfItems);
//    localLoad();
//    $("#ytbsp-modal-darken").click(function (e) {
//        if (e.target === this || /close\-modal/.test(e.target.className)) {
//            closeModal();
//        }
//    });
//    var mychannel = loadMyChannel();
//    var allchannels = loadAllChannels();
//    log("After load functions.");
//    $.when(mychannel, allchannels).done(function (mychannelresp, allchannelsresp) {
//        log("beginRequests done.");
//        var channelarr = {};
//        $.each(allchannelsresp, function (i, co) { channelarr[co.channelId] = co; });
//        //channelarr = $.map(allchannelsresp, function (e) { return {e.channelId, e; })
//        // Load channel playlist ID mapping from cache.
//        var cachedChannels = localRead("chancache");
//        if (cachedChannels === undefined) cachedChannels = [];
//        var renamelist = localRead("rename");
//        if (renamelist === undefined) renamelist = [];
//        $.each(cachedChannels, function (i, e) {
//            var channelId = e.channelId;
//            var chan = channelarr[channelId];
//            chan.found = true;
//            chan.playlistId = e.playlistId;
//            var rename = $.grep(renamelist, function (e) { return e.channelId === channelId; });
//            chan.title = e.title;
//            if (rename.length > 0) {
//                chan.oldtitle = chan.title;
//                chan.title = rename[0].title;
//            }
//            chan.image = e.image;
//        });
//        var toLoadData = {};
//        var toLoad = 0;
//        $.each(allchannelsresp, function (i, co) {
//            if (co.found) return;
//            toLoadData[co.channelId] = co;
//            toLoad++;
//        });
//        console.log(toLoadData);
//        //// Save channel playlist ids in cache.
//        //var chancache = localRead("chancache");
//        //cachemap = {};
//        //$.each(activechannels, function (i, co) { return cachemap[co.channelId] = co.playlistId; });

//        // Find channels that we need the playlist data for
//        var channeldata = loadChannelData(toLoadData);
//        channeldata.done(function () {
//            activechannels = allchannelsresp;
//            var cachedarr = {};
//            $.each(cachedChannels, function (i, co) { cachedarr[co.channelId] = co; });
//            $.each(allchannelsresp, function (i, co) {
//                var channelId = co.channelId;
//                var chan = cachedChannels[channelId];
//                if (!chan) {
//                    cachedarr[channelId] = {
//                        channelId: co.channelId,
//                        playlistId: co.playlistId,
//                        title: co.oldtitle ? co.oldtitle : co.title,
//                        image: co.image
//                    };
//                } else {
//                    chan.playlistId = co.playlistId;
//                    chan.title = co.oldtitle ? co.oldtitle : co.title;
//                    chan.image = co.image;
//                }
//            });
//            var cachedarr2 = [];
//            $.each(cachedarr, function (i, co) {
//                cachedarr2.push(co);
//            });
//            localWrite("chancache", cachedarr2);
//            mychanneldata = mychannelresp;
//            getNewVideos(true);
//            $(window).scroll(windowScroll);
//            $(window).resize(windowResize);
//            //window.addEventListener("scroll", windowScroll, false);
//            //window.addEventListener("resize", windowResize, false);
//        });
//    });
//}

function getNewVideos(first) {
    if (isMissing(first)) first = false;
    status("Loading new videos... This may take some time.");
    var tasks = $.map(activechannels, function (channel) { return loadPlaylistVideos(channel); });
    tasks.push(loadPlaylistVideos(mychanneldata));
    $.when.apply(null, tasks).then(function () {
        var allVideos = $.map(activechannels, function (channel) { return channel.videos; });
        var task = loadVideoInformation(allVideos);
        task.done(function () {
            //console.log("Video lists loaded.");
            UpdateVideoSeen(allVideos, mychanneldata);
            var sortUploaded = function (a, b) { return b.uploaded - a.uploaded; }
            $.each(activechannels, function (i, channel) { channel.videos.sort(sortUploaded); });
            if (first) {
                UpdateLatestVideo();
                ytbsp_loading = false;
                $(window).scroll(windowScroll);
                $(window).resize(windowResize);
                setupHeaders();
            }
            setTimeout(function () {
                clog("BuildPage timeout");
                status("Videos loaded, beginning building subscription list.");
                divWidth = $(subList).width() - 10;
                numberOfItems = Math.floor(divWidth / videoWidth);
                console.log("divWidth: " + divWidth + " #i: " + numberOfItems);
                if (first) BuildSubscriptionPage();
                else {
                    $.each(activechannels, function (i, channel) {
                        channel.updateLatestVideo();
                        channel.buildList();
                    });
                    resortSubs();
                    windowScroll();
                }
                //updateSubs();
                setTimeout(function () {
                    clog("Updatesubs timeout");
                    updateSubs();
                    status("Video loading completed. Enjoy.");
                }, 10);
            }, 10);
        });
    });
}

function setupHeaders() {
    var headers = $('.ytbsp-header');
    headers.html('' +
        '<span class="func func-dark refresh">[get new videos]</span>' +
        '<span class="func func-dark globaloptions">[options]</span>');
    $(".func.globaloptions", headers).click(function () {
        makeGlobalOptions();
    });
    $(".func.refresh", headers).click(function () {
        // TODO: Add refresh process, which check for new videos on the current playlists.
        ytbsp_first = false;
        getNewVideos();
    });
    //return;
    //headers.html('<span class="func unremove">[reset removed videos]</span>' +
    //    '<span class="func backup">[backup video info]</span>' +
    //    '<input type="checkbox" class="func sort" ' + (localRead("sortsubs") == true ? 'checked="checked" ' : '') + '/><span class="func sort">Sort videos</span>' +
    //    '<input type="checkbox" class="func hideseen" ' + (localRead("hideseen") == true ? 'checked="checked" ' : '') + '/><span class="func hideseen">Hide seen videos</span>' +
    //    '<input type="checkbox" class="func hidesubs" ' + (localRead("hidesubs") == false ? 'checked="checked" ' : '') + '/><span class="func hidesubs">Show empty</span>');
    //$(".func.unremove", headers).click(function () {
    //    $.each(activechannels, function (i, channel) {
    //        channel.unremoveAll();
    //    });
    //});
    //$(".func.backup", headers).click(function () {
    //    //makeBackup();
    //});
    //var sortel = $(".func.sort", headers);
    //sortel.click(function () {
    //    var sort = !localRead("sortsubs");
    //    localWrite("sortsubs", sort);
    //    sortel.attr("checked", sort);
    //    UpdateLatestVideo();
    //    resortSubs(true);
    //});
    //var hideseenel = $(".func.hideseen", headers);
    //hideseenel.click(function () {
    //    var hideseen = !localRead("hideseen");
    //    localWrite("hideseen", hideseen);
    //    hideseenel.attr("checked", hideseen);
    //    $(".func.showseen").css("display", hideseen ? "inline" : "none");
    //    updateSubs();
    //});
    //var hidesubsel = $(".func.hidesubs", headers);
    //hidesubsel.click(function () {
    //    var hidesubs = !localRead("hidesubs");
    //    localWrite("hidesubs", hidesubs);
    //    hidesubsel.attr("checked", !hidesubs);
    //    updateSubs();
    //});
}

var scrollTimeout = null;
var lastScroll = microtime(true);
var newScroll = 0;
var nextScroll = 0;
var scrollInterval = 2;
var scrolling = false;

function windowScroll() {
    // When the page is scrolled, we do not need to buildList.
    // We must simply update the images.
    if (scrolling) return;
    var now = microtime(true);
    if (nextScroll === 0) nextScroll = now;
    if (nextScroll > now) {
        // Queue up a scroll event
        if (scrollTimeout !== null) {
            clearTimeout(scrollTimeout);
            scrollTimeout = null;
        }
        scrollTimeout = setTimeout(windowScroll, scrollInterval * 1000 + 10);
    } else {
        // We can scroll now.
        scrolling = true;
        screenTop = document.body.scrollTop || document.documentElement.scrollTop;
        screenBottom = screenTop + window.innerHeight;

        lastScroll = now;
        updateSubs(null, false, true);
        nextScroll = microtime(true) + scrollInterval;

        try {
            clearTimeout(scrollTimeout);
        } catch (e) {
        }
        scrollTimeout = null;
        scrolling = false;
    }
}

var resizeTimeout = null;
var lastResize = microtime(true);
var resizeAgain = false;
var resizeInterval = 0.5;
var divWidth = 0;
// must match .ytbsp-video-item width and padding from stylesheet.
var videoWidth = 122 + 8;
var numberOfItems = 0;

function windowResize() {
    // When the page is resized, we need to buildList so we can update the number of items.
    // Note that calling buildList takes some time (around 1-2 seconds) so this is why we
    // split scrolling from resizing. The page is more responsive while scrolling.
    // We should also check to see if we need to build the list again based on the new number
    /// of items. To do this we check width / videoWidth and see if it matches our numberOfItems
    var width = $(subList).width() - 10;
    var newitemcount = Math.floor(width / videoWidth);
    //console.log("Resize");
    if (numberOfItems === newitemcount) return;
    var now = microtime(true);
    //console.log("Resize success");
    if (lastResize + resizeInterval > now) {
        if (resizeTimeout !== null) {
            clearTimeout(resizeTimeout);
            resizeTimeout = null;
        }
        resizeTimeout = setTimeout(windowResize, scrollInterval * 1000 + 10);
    } else {
        screenTop = document.body.scrollTop || document.documentElement.scrollTop;
        screenBottom = screenTop + window.innerHeight;

        divWidth = width;
        numberOfItems = newitemcount;

        updateSubs();

        lastResize = now;
        try {
            clearTimeout(resizeTimeout);
        } catch (e) {
        }
        resizeTimeout = null;
    }
}

//#region localStorage

function localWrite(key, value) {
    localdata[key] = value;
    localSave();
}

function localRead(key, def) {
    return localdata[key] ? localdata[key] : def;
}

function localLoad() {
    var obj = localStorage.getItem("YTBSP");
    if (typeof obj === "string")
        try {
            obj = JSON.parse(obj);
        } catch (e) {
        }
    if (isMissing(obj) || typeof obj !== "object") obj = {};
    if (obj.cache === undefined) obj.cache = [];
    if (obj.sortsubs === undefined) obj.sortsubs = true;
    if (obj.hideseen === undefined) obj.hideseen = false;
    if (obj.hidesubs === undefined) obj.hidesubs = false;
    if (obj.rename === undefined) obj.rename = {};
    if (obj.resort === undefined) obj.resort = true;
    if (obj.target === undefined) obj.target = "ytbsp_window";
    if (obj.addedlists === undefined) obj.addedlists = [];
    localdata = obj;
}

function localSave() {
    localStorage.setItem("YTBSP", JSON.stringify(localdata));
}

function saveYTBSPcache() {
    // Pull in the previous cache, then update it with these videos.
    var cache = localRead("cache");
    var allVideos = $.map(activechannels, function (channel) { return channel.videos; });
    var cachemap = {};
    // Grep is bad mmmkay? Map our cache to an object of video ids, then use that for lookup.
    // Reduced 2.5 second call to 0.018 seconds :D
    $.each(cache, function (i, co) { cachemap[co.videoId] = co; });
    $.each(allVideos, function (i, video) {
        var tcache = cachemap[video.videoId];
        if (isMissing(tcache)) {
            tcache = { "videoId": video.videoId };
            cache.push(tcache);
        }
        tcache.updated = video.updated;
        tcache.seen = video.seen;
        tcache.removed = video.removed;
        tcache.modified = video.modified;
    });
    localWrite("cache", cache);
}

//#endregion

//#region Modal

function closeModal() {
    var modal = document.getElementById("ytbsp-modal-darken");
    if (modal) {
        modal.style.display = "none";
        modal.style.opacity = "0";
    }
}

function modal(content, focus) {
    var innerModal = document.getElementById("ytbsp-modal-content");
    var modaldiv = document.getElementById("ytbsp-modal-darken");
    if (!innerModal || !modaldiv) throw new Error("Modal disapeared");
    innerModal.innerHTML = "";
    innerModal.appendChild(content);
    modaldiv.style.display = "block";
    if (focus) focus.focus();
    setTimeout(function () {
        modaldiv.style.opacity = "1";
    }, 10);
}

//#endregion

//#region My Channel

function loadMyChannel() {
    var mychannel;
    if (mychannel = localRead("ytbsp_mychannel")) {
        var c = new YTBSP_Channel(mychannel.cid);
        c.playlistId = mychannel.pid;
        return c;
    }
    var deferred = $.Deferred();
    var request = gapi.client.youtube.channels.list({
        'part': 'id,contentDetails',
        'mine': 'true'
    });
    request.execute(function (resp) { readMyChannel(resp, deferred); });
    return deferred.promise();
}

function readMyChannel(resp, deferred) {
    // My channel will be just a single channel, pull out the watchHistory
    // playlist and add it as a "channel" and return.
    var item = resp.items[0];
    var chan = new YTBSP_Channel(item.id);
    chan.playlistId = item.contentDetails.relatedPlaylists.watchHistory;
    localWrite("ytbsp_mychannel", { cid: chan.channelId, pid: chan.playlistId });
    deferred.resolve(chan);
}

//#endregion

//#region All Channels

function loadAllChannels(page) {
    var deferred = $.Deferred();
    var params = {
        'part': 'id,snippet',
        'order': 'alphabetical',
        'mine': 'true',
        'maxResults': (ytbsp_debug ? '10' : '50')
    };
    if (page !== undefined) {
        params.pageToken = page;
    }
    var request = gapi.client.youtube.subscriptions.list(params);
    request.execute(function (resp) { readAllChannels(resp, deferred); });
    return deferred.promise();
}

function readAllChannels(resp, deferred) {
    var channels = [];
    $.each(resp.items, function (i, item) {
        channels.push(new YTBSP_Channel(item.snippet.resourceId.channelId));
    });
    // If debugging, get a smaller subset of channels.
    if (!ytbsp_debug && resp.nextPageToken) {
        // If we have more pages, request the next page. This will recurse until we have no more pages.
        // We wait for the deferral so we don't accidentally resolve the original deferred object.
        var nextPageDeferred = loadAllChannels(resp.nextPageToken);
        nextPageDeferred.done(function (second) {
            channels = channels.concat(second);
            deferred.resolve(channels);
        });
        // DO NOT CALL deferred.resolve() here. We must wait for sub pages to complete first.
        // .done() does not block and therefore this function must exit WITHOUT resolving.
    } else {
        // Declare that we are done.
        deferred.resolve(channels);
    }
}

//#endregion

//#region Channel Data

function loadChannelData(channelsToLoad, page) {
    var deferred = $.Deferred();
    if (Object.keys(channelsToLoad).length <= 0)
        return deferred.resolve().promise();
    var params = {
        'part': 'id,snippet,contentDetails,status,brandingSettings',
        'id': Object.keys(channelsToLoad).join(),
        'maxResults': (ytbsp_debug ? '10' : '50')
    };
    if (page !== undefined) {
        params.pageToken = page;
    }
    var request = gapi.client.youtube.channels.list(params);
    request.execute(function (resp) { readChannelData(resp, deferred, channelsToLoad); });
    return deferred.promise();
}

function readChannelData(resp, deferred, channelsToLoad) {
    var channels = [];
    var renamelist = localRead("rename", {});
    $.each(resp.items, function (i, item) {
        var chan = channelsToLoad[item.id];
        //var chan = new YTBSP_Channel(item.id);
        chan.playlistId = item.contentDetails.relatedPlaylists.uploads;
        var renameto = renamelist[item.id];
        chan.title = item.snippet.title;
        if (!isMissing(renameto)) {
            chan.oldtitle = chan.title;
            chan.title = renameto;
        }
        chan.image = item.snippet.thumbnails.default.url;
        channels.push(chan);
    });
    // If debugging, get a smaller subset of channels.
    if (!ytbsp_debug && resp.nextPageToken) {
        // If we have more pages, request the next page. This will recurse until we have no more pages.
        // We wait for the deferral so we don't accidentally resolve the original deferred object.
        var nextPageDeferred = loadChannelData(channelsToLoad, resp.nextPageToken);
        nextPageDeferred.done(function (second) {
            channels = channels.concat(second);
            deferred.resolve(channels);
        });
        // DO NOT CALL deferred.resolve() here. We must wait for sub pages to complete first.
        // .done() does not block and therefore this function must exit WITHOUT resolving.
    } else {
        // Declare that we are done.
        deferred.resolve(channels);
    }
}

//#endregion

//#region Playlist Info

function loadPlaylistInfo(playlistId) {
    var deferred = $.Deferred();
    var params = {
        'part': 'id,snippet',
        'id': playlistId
    };
    var request = gapi.client.youtube.playlist.list(params);
    request.execute(function (resp) { readPlaylistInfo(resp, deferred); });
    return deferred.promise();
}

//#endregion

//#region Uploaded Videos

function loadPlaylistVideos(channel, pagination, page) {
    var deferred = $.Deferred();
    if (pagination === undefined) pagination = false;
    if (channel.playlistId === undefined || channel.playlistId === "") {
        console.warn("Unknown playlist ID for channel " + channel.channelId);
        return null;
    }
    var params = {
        'part': 'id,snippet',
        'playlistId': channel.playlistId,
        'maxResults': (ytbsp_debug ? '20' : '50')
    };
    if (pagination && page !== undefined) {
        params.pageToken = page;
    }
    var request = gapi.client.youtube.playlistItems.list(params);
    request.execute(function (resp) { readPlaylistVideos(resp, deferred, channel, pagination); });
    return deferred.promise();
}

function readPlaylistVideos(resp, deferred, channel, pagination) {
    if (resp.error) {
        // We failed to get this playlist, do we need to reauthenticate?
        console.log("readPlaylistVideos: " + resp.error.message);
        ytbsp_failures++;
        if (ytbsp_failures >= 2) {
            console.error("Failing out");
            return;
        }
        gapi.auth.authorize({ client_id: window.clientId, scope: window.scopes, immediate: true }, function (e) {
            var task = loadPlaylistVideos(channel, pagination);
            task.done(function () { deferred.resolve(); });
        });
        return;
    }
    ytbsp_failures = 0;
    if (isMissing(resp.items)) { deferred.resolve(); return; }
    $.each(resp.items, function (i, item) {
        if (ytbsp_first && i === 0) return;
        var videoId = item.snippet.resourceId.videoId;
        var vid = $.grep(channel.videos, function (e) { return e.videoId === videoId; });
        if (vid.length === 0) {
            vid = new YTBSP_Video(videoId);
            channel.videos.push(vid);
            vid.channels.push(channel);
        } else {
            vid = vid[0];
        }
        // Convert YT provided date (horrible display format) to epoch seconds.
        // This allows us to easily sort (numbers) and also easily convert to any
        // date format that we want to go to.
        //vid.uploaded = microtime(true, new Date(item.snippet.publishedAt));
        if (vid.modified === 0) vid.modified = vid.uploaded;
        vid.title = item.snippet.title;
        if (item.snippet.thumbnails) {
            vid.image = item.snippet.thumbnails.default.url;
        }
    });
    if (pagination && resp.nextPageToken) {
        var nextPageDeferred = loadPlaylistVideos(channel, pagination, resp.nextPageToken);
        nextPageDeferred.done(function () {
            channel.videos.sort(function (a, b) {
                return b.uploaded - a.uploaded;
            });
            deferred.resolve();
        });
        // DO NOT CALL deferred.resolve() here. We must wait for sub pages to complete first.
        // .done() does not block and therefore this function must exit WITHOUT resolving.
    } else {
        channel.videos.sort(function (a, b) {
            return b.uploaded - a.uploaded;
        });
        deferred.resolve();
    }
}

//#endregion

//#region Video Information

function loadVideoInformation(videos) {
    var deferred = $.Deferred();
    var unprocessed = $.grep(videos, function (e) { return e.processed === false; });
    if (unprocessed.length === 0) {
        deferred.resolve();
        return deferred.promise();
    }
    console.log(unprocessed.length + " new videos to process.");
    var deferreds = [];
    var kvideos = {};
    for (var i = 0; i < videos.length; i++) {
        var vid = videos[i];
        kvideos[vid.videoId] = vid;
    }
    var videoIdFunc = function (item) { return item.videoId; };
    for (var i = 0; i < unprocessed.length; i = i + 50) {
        var torun = unprocessed.slice(i, i + 50);
        console.log("Processing video information of ids " + i + " to " + (i + torun.length - 1));
        var ids = $.map(torun, videoIdFunc).join();
        deferreds.push(runVideoInformationRequest(ids, kvideos));
    }
    $.when.apply(null, deferreds).done(function () {
        deferred.resolve();
    });
    return deferred.promise();
}

function runVideoInformationRequest(ids, videos) {
    var deferred = $.Deferred();
    var params = {
        'part': 'id,snippet,contentDetails,statistics',
        'id': ids,
    };
    var request = gapi.client.youtube.videos.list(params);
    request.execute(function (resp) { readVideoInformation(resp, deferred, videos); });
    return deferred.promise();
}

function readVideoInformation(resp, deferred, videos) {
    $.each(resp.items, function (i, item) {
        var videoId = item.id;
        var video = videos[videoId];
        video.processed = true;
        video.uploaded = microtime(true, new Date(item.snippet.publishedAt));
        video.duration = parseDuration(item.contentDetails.duration);
        video.clicks = item.statistics.viewCount;
    });
    deferred.resolve();
}

function parseDuration(duration) {
    var durationparts = /PT((\d+)H)?((\d+)M)?((\d+)S)?/ig.exec(duration);
    if (durationparts !== undefined && durationparts !== null) {
        var realduration = "";
        var hours = durationparts[2];
        var hashours = !isMissing(hours);
        var minutes = durationparts[4];
        var hasminutes = !isMissing(minutes);
        var seconds = durationparts[6];
        if (isMissing(seconds)) seconds = "0";
        if (hashours && hasminutes) {
            realduration = padLeft(hours, 2) + ":" + padLeft(minutes, 2) + ":" + padLeft(seconds, 2);
        } else if (hashours) {
            realduration = padLeft(hours, 2) + ":00:" + padLeft(seconds, 2);
        } else if (hasminutes) {
            realduration = padLeft(minutes, 2) + ":" + padLeft(seconds, 2);
        } else {
            realduration = "00:" + padLeft(seconds, 2);
        }
        return realduration;
    }
    console.log("Could not parse duration: " + duration);
    return "";
}

function padLeft(nr, n, str) {
    return Array(n - String(nr).length + 1).join(str || '0') + nr;
}

//#endregion

function UpdateVideoSeen(allVideos, mychannel) {
    // For marking videos seen, we want to loop through the cached data, marking modified and seen/removed.
    // If we do not do this first, then videos could keep getting marked as seen from the mychannel.videos pass.
    $.each(localRead("cache"), function (i, item) {
        var vid = $.grep(allVideos, function (e) { return e.videoId === item.videoId; });
        // Since modified will be 0 or uploaded on all api videos, we need to update modified from cache always.
        $.each(vid, function (i, sitem) {
            if (item.modified !== undefined)
                sitem.modified = item.modified;
            sitem.seen = item.seen;
            sitem.removed = item.removed;
        });
    });
    // Now go through our current user's watched list. Mark any video seen if we didn't modify it after the updaded date
    // Note, for the watched list, uploaded == date user watched the video, not the date the video was uploaded.
    $.each(mychannel.videos, function (i, item) {
        var vid = $.grep(allVideos, function (e) { return e.videoId === item.videoId; });
        $.each(vid, function (i, sitem) {
            // If the current video was modified before we watched it, mark it as seen.
            if (sitem.modified < item.uploaded) {
                sitem.see();
            }
        });
    });
    saveYTBSPcache();
}

function UpdateLatestVideo() {
    $.each(activechannels, function (i, channel) { channel.updateLatestVideo(); });
    var sortAlpha = function (a, b) {
        var at = a.title.toLowerCase();
        var bt = b.title.toLowerCase();
        if (at === bt) return 0;
        return at < bt ? -1 : 1;
    };
    activechannels.sort(sortAlpha);
}

function BuildSubscriptionPage() {
    $.each(activechannels, function (i, channel) {
        var li = $("<li></li>", { class: "mix ytbsp-subscription ytbsp-subscription-light", id: channel.channelId });
        li.html('<div class="ytbsp-subinfo">'
            + '<div class="right"><span class="ytbsp-latestuploaded"></span> '
            + '<span class="func func-dark rename" title="Rename">[R]</span>'
            + '<span class="func func-dark removeall" title="Remove all">[RA]</span>'
            + '<span class="func func-dark reset" title="Unremove all">[UA]</span>'
            + '<span class="func func-dark allseen" title="Mark all seen">[M]</span>'
            + '<span class="func func-dark showseen" title="Show seen videos">[S]</span>'
            + '<span class="func func-dark showmore" title="Show more">[+]</span>'
            + '</div>'
            + '<h3 class="ytbsp-subtitle"><a href="'
            + CHANNELPREFIX + channel.channelId + '"></a></h3>'
            + '</div><ul class="ytbsp-subvids"></ul><div style="clear:both"></div>');
        channel.videoList = $(".ytbsp-subvids", li)[0];
        channel.row = li;
        var titleObj = $(".ytbsp-subtitle a", li)[0];
        $(titleObj).text(channel.title);
        $(li).attr("data-title", channel.title);
        li.appendTo(subList);
        var self = this;
        $(".func.rename", li).click(function () {
            makeRename(channel);
        });
        $(".func.removeall", li).click(function () {
            channel.removeAll();
            saveYTBSPcache();
            updateSubs();
            channel.updateLatestVideo();
            resortSubs();
        });
        $(".func.reset", li).click(function () {
            channel.reset();
            saveYTBSPcache();
            updateSubs();
            channel.updateLatestVideo();
            resortSubs();
        });
        $(".func.reset", li).click(function () {
            channel.reset();
            saveYTBSPcache();
            updateSubs();
            channel.updateLatestVideo();
            resortSubs();
        });
        $(".func.allseen", li).click(function () {
            channel.seenAll();
            saveYTBSPcache();
            updateSubs();
            channel.updateLatestVideo();
            resortSubs();
        });
        channel.showseenjq = $(".func.showseen", li)
            .click(function () {
                channel.showSeen();
                updateSubs();
                channel.updateLatestVideo();
                resortSubs();
            })
            .css("display", (localRead("hideseen") ? "inline" : "none"));
        $(".func.showmore", li).click(function () {
            channel.showMore();
            updateSubs();
            channel.updateLatestVideo();
            resortSubs();
        });

        channel.updateLatestVideo();
        // For some reason, the inital width is just slightly larger than what it normally would be.
        // Trimming it down by 10 pixels seems to resolve the issue in most cases.
        var width = $(li).width() - 10;
        var num = Math.floor(width / videoWidth);
        //channel.buildList(num);
    });
    handleResort(true);
    $("#ytbsp-lsl").hide();
    //resortSubs();
}

//#region YTBSP_Video

function YTBSP_Video(videoId) {
    this.videoId = videoId;
    this.uploaded = 0;
    this.modified = 0;
    this.duration = "";
    this.title = "";
    this.image = "";
    this.channels = [];
    this.clicks = 0;
    this.seen = false;
    this.removed = false;
    this.processed = false;
}

YTBSP_Video.prototype = {
    see: function () {
        if (this.seen) return false;
        this.seen = true;
        this.modified = unixTime();
        return true;
    },
    toggleSeen: function () {
        this.seen = !this.seen;
        this.modified = unixTime();
    },
    remove: function () {
        if (this.removed) return;
        this.removed = true;
        this.modified = unixTime();
    },
    unremove: function () {
        if (!this.removed) return;
        this.removed = false;
        this.modified = unixTime();
    },
    isRemoved: function (ignoreHideSeen) {
        return this.removed || (!ignoreHideSeen && (localRead("hideseen") === true) && this.seen);
    },
    reset: function () {
        this.seen = false;
        this.removed = false;
        this.modified = unixTime();
    },
    createThumb: function (inView) {
        var self = this;

        this.thumb = document.createElement("li");
        this.thumb.id = "YTBSPthumb_" + this.videoId;
        //console.log(this.seen);
        this.thumb.innerHTML = '<div class="ytbsp-clip ux-thumb-wrap">'
            + '<div class="ytbsp-x ytbsp-x-light yt-uix-tooltip" data-tooltip-text="remove video" title="remove video">X</div>'
            //+ '<div class="ytbsp-w ytbsp-w-light yt-uix-tooltip" data-tooltip-text="watch later" title="watch later">W</div>'
            + '<div class="ytbsp-s ytbsp-s-light yt-uix-tooltip" data-tooltip-text="toggle seen" title="toggle seen">S</div>'
            + '<a>'
            + '<img class="ytbsp-thumb" ' + (inView ? "" : "data-") + 'src="' + this.image + '" /></a>'
            + '<div class="video-time"></div></div><a class="vlink"></a>'
            + '<p class="ytbsp-views"></p><p class="ytbsp-uploaded"></p>';

        // create references to objects
        this.durationItem = $(".video-time", this.thumb)[0];
        this.clicksItem = $(".ytbsp-views", this.thumb)[0];
        this.uploadItem = $(".ytbsp-uploaded", this.thumb)[0];
        this.titleItem = $("a.vlink", this.thumb)[0];
        this.thumbImage = $(".ytbsp-thumb", this.thumb)[0];
        this.links = $("a", this.thumb);
        this.links.click(function () {
            if (!self.see()) return;
            saveYTBSPcache();
            self.updateThumb();
            var s = $(self.channels).is(function (channel) { return self.channels[channel].updateLatestVideo(self.uploaded); });
            if (s) resortSubs();
        });
        this.updateThumb();

        $(".ytbsp-s", this.thumb)[0].addEventListener("click", function () {
            self.toggleSeen();
            self.channels.forEach(function (channel) {
                channel.buildList();
            });
            saveYTBSPcache();
            self.updateThumb();
            var s = $(self.channels).is(function (channel) { return self.channels[channel].updateLatestVideo(self.uploaded); });
            // s === did we update latest video? If so, resort.
            if (s) resortSubs();
        }, false);

        $(".ytbsp-x", this.thumb)[0].addEventListener("click", function () {
            self.remove();
            self.channels.forEach(function (channel) {
                channel.buildList();
            });
            saveYTBSPcache();
            var s = $(self.channels).is(function (channel) { return self.channels[channel].updateLatestVideo(self.uploaded); });
            if (s) resortSubs();
        }, false);

        return this.thumb;
    },
    updateThumb: function (thumb, inView) {
        if (thumb !== undefined) this.thumb = thumb;
        this.thumb.className = "ytbsp-video-item ytbsp-video-item-light" + (this.seen ? ' seen' : '');
        this.thumb.title = this.title;
        this.durationItem.textContent = this.duration;
        this.clicksItem.textContent = this.clicks + " Views";
        this.uploadItem.innerHTML = window.formatDate(this.uploaded, true);
        //this.titleItem.title = this.title;
        this.titleItem.textContent = this.title;
        // If we have the src attr already set, we don't need a data-src attr.
        var cursrc = $(this.thumbImage).attr("src");
        if (isMissing(cursrc) || cursrc === "") {
            $(this.thumbImage).attr((inView ? "" : "data-") + "src", this.image);
        }
        this.updateTarget();
        this.updateUrl();
    },
    updateTarget: function (target) {
        if (this.links) this.links.attr("target", target || localRead("target") || "ytbsp_window");
    },
    updateUrl: function (vd, hd) {
        var url = "";
        vd = vd || localRead("display") || "embed";
        hd = hd || localRead("highdef") || "";
        if (hd !== "") hd = "&vq=" + hd;
        if (vd === "normal") url = "https://www.youtube.com/watch?v=" + this.videoId + "?" + hd;
        else if (vd === "embed") url = "embed.html?v=" + encodeURIComponent("http://youtube.googleapis.com/v/" + this.videoId + "?" + htmlEncode(hd + "&autoplay=1&fs=1&autohide=1"));
        if (this.links) this.links.attr("href", url);
    },
    makeSave: function () {
        return { "videoId": this.videoId, "seen": this.seen, "removed": this.removed };
    }
};

//#endregion

//#region YTBSP_Channel

function YTBSP_Channel(channelId) {
    this.channelId = channelId;
    this.playlistId = "";
    this.channelUrl = "";
    this.latestUploaded = -1;
    this.image = "";
    this.title = "";
    this.videos = [];
    this.videoList = null;
}

YTBSP_Channel.prototype = {
    showall: false,
    needsUpdate: true,
    isInView: false,
    ignoreHideSeen: false,
    latestUploaded: 0,
    absoluteUploaded: 0,
    row: null,
    lastViewCheck: 0,

    updateLatestVideo: function (videouploaded) {
        // If we passed in a video uploaded time, we can check to see if we need
        // to do this check.
        if (!isMissing(videouploaded) && videouploaded < this.latestUploaded) return false;
        var uploaded = 0;
        var seenuploaded = 0;
        $.each(this.videos, function (i, item) {
            if (item.removed) return;
            if (item.uploaded > seenuploaded) seenuploaded = item.uploaded;
            if (item.seen) return;
            if (item.uploaded > uploaded) uploaded = item.uploaded;
        });
        //console.log(uploaded);
        this.latestUploaded = uploaded;
        this.absoluteUploaded = seenuploaded;
        if (!isMissing(this.row)) {
            $(this.row).attr("data-uploaded", this.latestUploaded);
            $(this.row).attr("data-absolute", this.absoluteUploaded);
            var k = $(".ytbsp-latestuploaded", this.row);
            if (this.latestUploaded === 0) {
                k.text("");
            } else {
                k.text(formatDate(this.latestUploaded, false));
            }
        }
        return true;
    },
    inView: function () {
        if (this.lastViewCheck === lastScroll) {
            return this.isInView;
        }
        this.lastViewCheck = lastScroll;
        var offsetTop = this.videoList ? this.videoList.offsetTop : 0;

        return this.isInView = (this.videoList
            && offsetTop - SCREENLOADTHREADSHOLD < window.screenBottom
            && offsetTop + SCREENLOADTHREADSHOLD > window.screenTop
        );
    },
    isEmpty: function () {
        return $(".ytbsp-video-item", this.videoList, true).length === 0;
    },
    handleVisibility: function () {
        //this.row.css("display", (this.isEmpty() && localRead("hidesubs")) ? "none" : "");
    },
    buildList: function (limit) {
        var start = microtime(true);
        this.needsUpdate = false;
        this.thumbs = {};
        var alreadyIn = $(".ytbsp-video-item", this.videoList, true);
        var visibleItems = 0;
        if (limit === undefined) limit = numberOfItems;
        if (this.showall) {
            limit = 50;
            $(".ytbsp-subvids", this.row).css("white-space", "normal");
        } else {
            $(".ytbsp-subvids", this.row).css("white-space", "nowrap");
        }
        var thumb;
        var self = this;
        $.each(this.videos, function (i, video) {
            if (video.isRemoved(self.ignoreHideSeen)) {
                thumb = $("#YTBSPthumb_" + video.videoId, self.videoList, true)[0];
                var index = $.inArray(thumb, alreadyIn);
                if (thumb && index !== -1) {
                    thumb.parentNode.removeChild(thumb);
                    alreadyIn.splice(index, 1);
                }
            } else if (visibleItems < limit) {
                thumb = alreadyIn[visibleItems];
                if (thumb && thumb.id.substr(11) === video.videoId) {
                    video.updateThumb(thumb, self.inView());
                } else {
                    thumb = video.createThumb(self.inView());

                    if (visibleItems < alreadyIn.length) {
                        self.videoList.insertBefore(thumb, alreadyIn[visibleItems]);
                        alreadyIn.splice(visibleItems, 0, thumb);
                    } else {
                        self.videoList.appendChild(thumb);
                        alreadyIn.push(thumb);
                    }
                }
                visibleItems++;
            }
        });

        for (var j = visibleItems, ilen = alreadyIn.length; j < ilen; j++) {
            self.videoList.removeChild(alreadyIn[j]);
        }
        this.handleVisibility();
        var end = microtime(true);
        var dur = end - start;
        log("buildList " + this.channelId + " duration " + dur.toFixed(2));
    },
    removeAll: function () {
        $.each(this.videos, function (i, obj) {
            obj.remove();
        });
        this.buildList();
    },
    unremoveAll: function () {
        $.each(this.videos, function (i, obj) {
            obj.unremove();
        });
        this.buildList();
    },
    reset: function () {
        $.each(this.videos, function (i, obj) {
            obj.reset();
        });
        this.buildList();
    },
    seenAll: function () {
        $.each(this.videos, function (i, obj) {
            obj.see();
        });
        this.buildList();
    },
    showSeen: function () {
        this.ignoreHideSeen = !this.ignoreHideSeen;
        this.showseenjq.text("[" + (this.ignoreHideSeen ? "hide seen" : "show seen") + "]");
        this.buildList();
    },
    showMore: function () {
        this.showall = !this.showall;
        this.buildList();
    },
    makeSave: function () {
        return { "channelId": this.channelId, "playlistId": this.playlistId, "videos": $.map(this.videos, function (video) { return video.makeSave(); }) };
    }
};

//#endregion