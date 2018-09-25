/**
 * 大连理工大学马克思主义学院官网通知公告抓取模块
 *
 */

const request = require('superagent');
const cheerio = require('cheerio');
const newsType = require('../config/config').type;
//获取首页地址
const base = 'http://marx.dlut.edu.cn';
const firstPage = '/rcpy/bkspy.htm';

let db = require('../models/index');
let news = db.models.News;

function getNoticeTitleAndUrl(url) {
    return new Promise((resolve, reject) => {
        request
            .get(url)
            .end((err, res) => {
                if (err)
                {
                    reject(err.toString());
                }
                else
                {
                    let $ = cheerio.load(res.text);
                    let data = [];
                    let html = $('div.ny_list');
                    html.find('li').each((index, element) => {
                        data.push({
                            name: element.children[0].children[0].data,
                            url: base + /(\/info[\s\S]{0,200})/.exec(element.children[0].attribs.href)[1]
                        })
                    });

                    html.find('a.Next').each((index, element) => {
                        if (element.children[0].data === '下页') {
                            data.push({
                                next: base + '/rcpy/bkspy/' + /[\s\S]{0,200}([0-9]{1,10}.htm)$/.exec(element.attribs.href)[1]
                            })
                        }
                    });

                    resolve(data);//请求成功，将promise设置成resolve。将数据设置成接受成功状态
                }
            });
    });
}

function getAllData(data) {//获取通知具体数据
    return new Promise((resolve, reject) => {
        request
            .get(data.url)
            .end((err, res) => {
                if (err)
                {
                    reject(err.toString());
                }
                else
                {
                    let $ = cheerio.load(res.text);
                    let header = $('div.header_con');
                    let value = {};
                    value.title = header.find('h3')[0].children[0].data;

                    let array = /^时间：([0-9]{4}-[0-9]{2}-[0-9]{2})\s作者：([^z]{0,100})$/.exec(header.find('p')[0].children[0].data);

                    value.dateStr = array[1];
                    value.from = '';
                    let fromTemp = array[2].split('');
                    for(let i = 0;i<fromTemp.length;i++)
                    {
                         if(fromTemp[i] != ' ')
                             value.from += fromTemp[i];
                         else
                             break;
                    }
                    value.url = data.url;
                    value.time = new Date();
                    //该项为原始通知部分网页，若有图片应注意图片的src需添加前缀，同时应该去除所有标签class,开发区校区通知不需要故而省去，只执行添加附件
                    let content = $('div#vsb_content');
                    if(content.html() == null)
                        content = $('div#vsb_content_6');
                    let files = $('form[name=_newscontent_fromname] > ul');
                    files.find('li').each((index, element) => {
                        let temp = element.children[1].attribs.href;
                        element.children[1].attribs.href = base + temp;
                    });

                    //content.append(files.html());
                    let file = [];

                    if (files.length > 0) {
                        files[0].children.forEach(element => {
                            if (element.name === 'li') {
                                file.push({
                                    link: element.children[1].attribs.href,
                                    fileName: element.children[1].children[0].data
                                })
                            }
                        });
                    }

                    //去除calss
                    content.find('tr').each((index, element) => {
                        if (element.attribs.class != undefined)
                            delete element.attribs.class;
                    });
                    //修改图片src
                    content.find('img').each((index, element) =>{
                        let addressTemp = base + element.attribs.src;
                        element.attribs.src = addressTemp;
                    });


                    value.body = content.html();


                    value.fileLinks = file;
                    value.type = newsType.EDANotice;
                    value.clickCount = 0;

                    //数据库交互操作
                    news.count({
                        where: {
                            title: value.title
                        }
                    })
                        .then(value1 => {
                            if (value1 === 0)
                            {
                                news.create(value).then(() => {
                                    resolve(true)
                                }).catch((error => {
                                    reject(error.toString());
                                }));
                            }
                            else {
                                news.find({
                                    where: {
                                        title: value.title
                                    }
                                }).then(value2 => {
                                    value2.update(value).then(() => {
                                        resolve(true)
                                    }).catch((error => {
                                        reject(error.toString());
                                    }));
                                })
                            }
                        }).catch(error => {
                        reject(error.toString())
                    });
                }
            })
    });
}

async function start(url) {
    let value = await getNoticeTitleAndUrl(url);
    // let count = 9;
    for (let element of value) {
        if (element.hasOwnProperty('next')) {
            await start(element.next);
        }
        else {
            // if(count > 0){
                await getAllData(element);
                // count --;
            // }
        }
    }
}

module.exports = async function run() {
    await start(base + firstPage);
};
