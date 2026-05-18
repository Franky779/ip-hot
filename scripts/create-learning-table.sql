-- 分类学习记录表：记录用户手动修正分类的行为，用于逐步优化 LLM 分类准确率

CREATE TABLE IF NOT EXISTS classification_learnings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  article_id uuid REFERENCES articles(id) ON DELETE CASCADE,
  original_title text NOT NULL,
  original_category text,
  corrected_category text NOT NULL,
  title_keywords text[] DEFAULT '{}',
  match_count integer DEFAULT 1,
  is_active boolean DEFAULT true,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- GIN 索引加速关键词数组查询
CREATE INDEX IF NOT EXISTS idx_learning_keywords ON classification_learnings USING gin(title_keywords);
CREATE INDEX IF NOT EXISTS idx_learning_active ON classification_learnings(is_active);
CREATE INDEX IF NOT EXISTS idx_learning_created ON classification_learnings(created_at DESC);

-- 自动更新 updated_at 的触发器
CREATE OR REPLACE FUNCTION update_learning_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_learning_updated ON classification_learnings;
CREATE TRIGGER trg_learning_updated
  BEFORE UPDATE ON classification_learnings
  FOR EACH ROW
  EXECUTE FUNCTION update_learning_timestamp();
