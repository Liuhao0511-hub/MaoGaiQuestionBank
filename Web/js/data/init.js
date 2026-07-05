// 数据合并初始化
// 将所有章节数据合并为 QUESTION_BANK 全局对象

(function() {
    // 按章节ID排序
    var chapters = window.__CHAPTER_DATA__ || [];
    chapters.sort(function(a, b) { return a.id.localeCompare(b.id); });
    
    // 构建最终题库对象
    window.QUESTION_BANK = {
        chapters: chapters
    };
    
    // 清理临时变量
    delete window.__CHAPTER_DATA__;
    
    console.log('毛概题库已加载：共 ' + chapters.length + ' 个章节，' + 
        chapters.reduce(function(sum, ch) { return sum + ch.questions.length; }, 0) + ' 道题目');
})();
