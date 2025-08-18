import yaml from 'js-yaml';

/**
 * YAML 合并工具类
 * 提供锚点创建、展开和各种 YAML 处理功能
 */
class YamlMerger {
  /**
   * 将模板+事件结构渲染为带锚点与别名的 YAML 字符串
   * 支持在实例级追加 overrides（如 docker.image）
   * @param {Object} templates - 模板对象 { [name]: template }
   * @param {Object} branches - 分支配置对象 { [branch]: { [event]: [...] } }
   * @returns {string} - 带锚点的 YAML 字符串
   */
  buildYamlWithAnchors(templates, branches) {
    const parts = [];

    // 1) 顶部输出模板锚点：`.name: &name`，其值是一个映射，需要缩进
    Object.entries(templates).forEach(([name, tpl]) => {
      parts.push(`.${name}: &${name}`);
      parts.push(this.indentBlock(yaml.dump(tpl), 2));
      parts.push('');
    });

    // 2) 输出分支与事件
    Object.entries(branches).forEach(([branch, events]) => {
      parts.push(`${this.quoteIfNeeded(branch)}:`);
      Object.entries(events).forEach(([eventKey, arr]) => {
        const isCron = eventKey.startsWith('crontab: ');
        const ek = isCron ? `"${eventKey}"` : eventKey; // crontab 带冒号，须加引号
        parts.push(`  ${ek}:`);
        if (!arr || arr.length === 0) {
          parts.push('    []');
          return;
        }
        arr.forEach(item => {
          parts.push('    -');
          parts.push(`      name: ${this.quoteIfNeeded(item.name)}`);
          parts.push(`      <<: *${item.alias}`);
          if (item.overrides && Object.keys(item.overrides).length > 0) {
            // 把 overrides 展到实例下（例如 docker.image）
            const dumped = yaml.dump(item.overrides).trimEnd();
            parts.push(this.indentBlock(dumped, 6));
          }
        });
      });
    });

    return parts.join('\n');
  }

  /**
   * 将带锚点的YAML字符串展开为完整的内联版本
   * @param {string} anchoredYaml - 带锚点的YAML字符串
   * @returns {string} - 展开后的完整YAML字符串
   */
  expandAnchorsToFullYaml(anchoredYaml) {
    try {
      // 解析带锚点的YAML
      const parsed = yaml.load(anchoredYaml);
      
      // 提取所有锚点模板（以 . 开头的键）
      const anchors = {};
      const result = {};
      
      Object.entries(parsed).forEach(([key, value]) => {
        if (key.startsWith('.')) {
          // 这是锚点定义，存储起来
          const anchorName = key.slice(1); // 去掉前缀的 .
          anchors[anchorName] = value;
        } else {
          // 这是正常的分支配置
          result[key] = value;
        }
      });
      
      // 递归展开所有锚点引用
      const expandValue = (value) => {
        if (Array.isArray(value)) {
          return value.map(expandValue);
        } else if (value && typeof value === 'object') {
          const expanded = {};
          
          // 处理 <<: *anchor 合并语法
          if (value['<<'] && typeof value['<<'] === 'string') {
            const anchorRef = value['<<'];
            if (anchorRef.startsWith('*')) {
              const anchorName = anchorRef.slice(1);
              if (anchors[anchorName]) {
                // 先展开锚点内容
                const anchorContent = expandValue(anchors[anchorName]);
                Object.assign(expanded, anchorContent);
              }
            }
          }
          
          // 处理其他属性
          Object.entries(value).forEach(([k, v]) => {
            if (k !== '<<') {
              expanded[k] = expandValue(v);
            }
          });
          
          return expanded;
        }
        return value;
      };
      
      const expandedResult = expandValue(result);
      return yaml.dump(expandedResult);
    } catch (err) {
      throw new Error(`Error expanding anchors: ${err.message}`);
    }
  }

  /**
   * 缩进文本块
   * @param {string} text - 要缩进的文本
   * @param {number} spaces - 缩进空格数，默认2
   * @returns {string} - 缩进后的文本
   */
  indentBlock(text, spaces = 2) {
    const pad = ' '.repeat(spaces);
    return String(text)
      .split('\n')
      .map((line) => (line.trim().length ? pad + line : line))
      .join('\n');
  }


  /**
   * 根据需要给字符串加引号
   * @param {string} s - 输入字符串
   * @returns {string} - 处理后的字符串
   */
  quoteIfNeeded(s) {
    const str = String(s);
    return /[:#\-?*&!|>'"%@`{}[\],\s]/.test(str) ? JSON.stringify(str) : str;
  }
}

// 创建单例实例并导出
const yamlMerger = new YamlMerger();

export default yamlMerger;