
function log(data) {
    if (ytbsp_debug) console.log(data);
}

function unixTime() {
    return Math.floor(Date.now() / 1000);
}

function microtime(get_as_float, date) {
    // http://kevin.vanzonneveld.net
    // +   original by: Paulo Freitas
    // *     example 1: timeStamp = microtime(true);
    // *     results 1: timeStamp > 1000000000 && timeStamp < 2000000000
    if (isMissing(date)) date = new Date();
    var now = date.getTime() / 1000;
    var s = parseInt(now, 10);

    return (get_as_float) ? now : (Math.round((now - s) * 1000) / 1000) + ' ' + s;
}

function formatDate(intval, newline) {
    var date = new Date(intval * 1000);
    return date.toString("MM/dd/yy") + (newline ? "<br />" : " ") + date.toString("hh:mm:ss tt");
}

function isMissing(e) {
    return e === undefined || e === null;
}

function htmlEncode(value) {
    //create a in-memory div, set it's inner text(which jQuery automatically encodes)
    //then grab the encoded contents back out.  The div never exists on the page.
    return $('<div/>').text(value).html();
}

function htmlDecode(value) {
    return $('<div/>').html(value).text();
}

//#region User Interface Elements

function ha(obj, text, content) {
    $(obj).text(text);
    if (content) content.appendChild(obj);
    return obj;
}

function h1(text, content) { return ha(document.createElement("h1"), text, content); }

function h2(text, content) { return ha(document.createElement("h2"), text, content); }

function h3(text, content) { return ha(document.createElement("h3"), text, content); }

function h4(text, content) { return ha(document.createElement("h4"), text, content); }

function h5(text, content) { return ha(document.createElement("h5"), text, content); }

function h6(text, content) { return ha(document.createElement("h6"), text, content); }

function div(content) {
    var obj = document.createElement("div");
    if (content) content.appendChild(obj);
    return obj;
}

function p(text, content) {
    var obj = document.createElement("p");
    $(obj).text(text);
    if (content) content.appendChild(obj);
    return obj;
}

function br(content) {
    var obj = document.createElement("br");
    if (content) content.appendChild(obj);
    return obj;
}

function table(content) {
    var obj = document.createElement("table");
    if (content) content.appendChild(obj);
    return obj;
}

function tr(content) {
    var obj = document.createElement("tr");
    if (content) content.appendChild(obj);
    return obj;
}

function td(content, contains) {
    var obj = document.createElement('td');
    if (content) content.appendChild(obj);
    if (contains) obj.appendChild(contains);
    return obj;
}

function span(text, content) {
    var obj = document.createElement("span");
    $(obj).text(text);
    if (content) content.appendChild(obj);
    return obj;
}

function input(type, classnames, content) {
    var obj = document.createElement("input");
    obj.type = type;
    obj.class = classnames;
    if (content) content.appendChild(obj);
    return obj;
}

//#endregion
