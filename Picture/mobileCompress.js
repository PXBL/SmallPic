/**
 * 文件读取并通过canvas压缩转成base64
 * @param files
 * @param callback
 */

//EXIF js 可以读取图片的元信息  https://github.com/exif-js/exif-js

//引下面这个或者在相应界面调用
var newscript = document.createElement('script');
newscript.setAttribute('type','text/javascript');
newscript.setAttribute('src','./exif.js');
var head = document.getElementsByTagName('head')[0];
head.appendChild(newscript);

// 压缩图片时 质量减少的值
const COMPRESS_QUALITY_STEP = 0.03;
const COMPRESS_QUALITY_STEP_BIG = 0.06;
// 压缩图片时，图片尺寸缩放的比例，eg：0.9, 等比例缩放为0.9
const COMPRESS_SIZE_RATE = 1;

let defaultOptions = {
    removeBase64Header: false,//是否移除 base64前缀
    maxSize: 2,//最大压缩后尺寸单位M
    sizeRate:1,//按比例缩放尺寸范围(0,1]大于一也可以
    fillBgColor: '#ffffff',//背景色,png图片会转成jpg,不能带透明度,默认颜色为白色
};

/**
 *  将待上传文件列表压缩并转换base64
 *  ！！！！ 注意 ： 图片会默认被转为 jpeg ， 透明底会加白色背景
 *  files : 文件列表 ，必须是数组
 *  callback : 回调，每个文件压缩成功后都会回调,
 *  options ：配置
 *  options.removeBase64Header : 是否需要删除 'data:image/jpeg;base64,'这段前缀，默认false
 *  @return { base64Data: '',fileType: '' }， //fileType强制改为jpeg
 */
export function imageListConvert(files, callback, options) {
    if (!files.length) {
        console.warn('files is null');
        return;
    }
    options = { ...defaultOptions, ...options };
    options.maxSize=options.maxSize*1024*1024
    // 获取图片方向
    EXIF.getData(files[0], function() {
        let orientation = EXIF.getTag(this, 'Orientation');
        let make = EXIF.getTag(this, 'Make');
        orientation=(((!make)||make==="Apple")?orientation:1);//别的就顺时针转90
        
        
        console.log("orientation",orientation);
        for (let i = 0, len = files.length; i < len; i++) {
            let file = files[i];
            let fileType = getFileType(file.name);

            //强制改为jpeg
            fileType = 'jpeg';

            let reader = new FileReader();
            reader.onload = (function() {
                return function(e) {
                    let image = new Image();
                    image.onload = function() {
                        let data = convertImage(
                            image,
                            orientation,
                            fileType,
                            options.maxSize,
                            options.fillBgColor
                        );
                        if (options.removeBase64Header) {
                            data = removeBase64Header(data);
                        }
                        callback({
                            base64Data: data,
                            fileType: fileType,
                            make:make,
                            orientation:orientation,

                        });
                    };
                    image.src = e.target.result;
                };
            })(file);
            reader.readAsDataURL(file);
        }
    });
}

/**
 * 将 image 对象 画入画布并导出base64数据
 */
export function convertImage(
    image,
    orientation,
    fileType = 'jpeg',
    maxSize = 200 * 1024,
    fillBgColor = '#ffffff'
) {
    let maxWidth = 1280,
        maxHeight = 1280,
        cvs = document.createElement('canvas'),
        w = image.width,
        h = image.height,
        quality = 0.9;

    /**
     * 这里用于计算画布的宽高
     */
    if (w > 0 && h > 0) {
        if (w / h >= maxWidth / maxHeight) {
            if (w > maxWidth) {
                h = (h * maxWidth) / w;
                w = maxWidth;
            }
        } else {
            if (h > maxHeight) {
                w = (w * maxHeight) / h;
                h = maxHeight;
            }
        }
    }

    let ctx = cvs.getContext('2d');
    let size = prepareCanvas(cvs, ctx, w, h, orientation);

    // 填充背景
    ctx.fillStyle = fillBgColor;
    ctx.fillRect(0, 0, size.w, size.h);

    //将图片绘制到Canvas上，从原点0,0绘制到w,h
    ctx.drawImage(image, 0, 0, size.w, size.h);

    let dataUrl = cvs.toDataURL(`image/${fileType}`, quality);

    //当图片大小 > maxSize 时，循环压缩,并且循环不超过5次
    let count = 0;
    while (dataUrl.length > maxSize && count < 10) {
        let imgDataLength = dataUrl.length;
        let isDoubleSize = imgDataLength / maxSize > 2;

        // 质量一次下降
        quality -= isDoubleSize
            ? COMPRESS_QUALITY_STEP_BIG
            : COMPRESS_QUALITY_STEP;
        quality = parseFloat(quality.toFixed(2));

        // 按比例缩放尺寸
        let scaleStrength = defaultOptions.sizeRate||COMPRESS_SIZE_RATE;
        w = w * scaleStrength;
        h = h * scaleStrength;

        size = prepareCanvas(cvs, ctx, w, h, orientation);

        //将图片绘制到Canvas上，从原点0,0绘制到w,h
        ctx.drawImage(image, 0, 0, size.w, size.h);

        console.log(`imgDataLength：${imgDataLength} , maxSize --> ${maxSize}`);
        console.log(`size.w:${size.w}, size.h:${size.h}, quality：${quality}`);
        dataUrl = cvs.toDataURL(`image/jpeg`, quality);
        count++;
    }

    console.log(`imgDataLength：${dataUrl.length} , maxSize --> ${maxSize}`);
    console.log(`size.w:${size.w}, size.h:${size.h}, quality：${quality}`);

    cvs = ctx = null;
    return dataUrl;
}

/**
 * 准备画布
 * cvs 画布
 * ctx 上下文
 * w : 想要画的宽度
 * h : 想要画的高度
 * orientation : 屏幕方向
 */
function prepareCanvas(cvs, ctx, w, h, orientation) {
    cvs.width = w;
    cvs.height = h;
    //判断图片方向，重置canvas大小，确定旋转角度，iphone默认的是home键在右方的横屏拍摄方式
    let degree = 0;
    orientation;
    switch (orientation) {
        case 3:
            //iphone横屏拍摄，此时home键在左侧
            cvs.width = h;
            cvs.height = w;
            degree = 270;
            w = -w;
            // h = h;
            break;

        case 1:
            //iphone竖屏拍摄，此时home键在下方(正常拿手机的方向)
            cvs.width = h;
            cvs.height = w;
            degree = 90;
            // w = w;
            h = -h;
            break;
        case 8:
            //iphone竖屏拍摄，此时home键在上方
            
            degree = 180;
            w = -w;
            h = -h;
            break;

    }

    // console.log(`orientation --> ${orientation} , degree --> ${degree}`);
    // console.log(`w --> ${w} , h --> ${h}`);
    //使用canvas旋转校正
    ctx.rotate((degree * Math.PI) / 180);
    return { w, h };
}

/**
 * 截取 ‘data:image/jpeg;base64,’，
 * 截取到第一个逗号
 */
export function removeBase64Header(content) {
    if (content.substr(0, 10) === 'data:image') {
        let splitIndex = content.indexOf(',');
        return content.substring(splitIndex + 1);
    }
    return content;
}

export function getFileType(fileName = '') {
    return fileName.substring(fileName.lastIndexOf('.') + 1);
}

export function checkAccept(
    file,
    accept = 'image/jpeg,image/jpg,image/png,image/gif'
) {
    return accept.toLowerCase().indexOf(file.type.toLowerCase()) !== -1;
}