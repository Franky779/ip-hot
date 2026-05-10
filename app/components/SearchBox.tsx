export function SearchBox({
  defaultValue,
  activeCategory,
}: {
  defaultValue: string
  activeCategory: string
}) {
  return (
    <form className="search-box" action="/" method="get">
      {activeCategory !== 'all' && (
        <input type="hidden" name="category" value={activeCategory} />
      )}
      <input
        type="search"
        name="q"
        placeholder="搜索标题关键词..."
        defaultValue={defaultValue}
        className="search-input"
        aria-label="搜索文章标题"
      />
      <button type="submit" className="search-btn">
        搜索
      </button>
    </form>
  )
}
