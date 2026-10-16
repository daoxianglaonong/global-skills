# Acme 组件

样式在 `components.css`；状态同时认伪类与 `.is-*` 静态 class。

## 组件清单

| 组件 | 状态 | 来源 | 缺什么 |
| --- | --- | --- | --- |
| 按钮 | 已收录 | 规范控件样张；产品页 | — |
| 输入框 | 已收录 | 规范控件样张 | — |
| Tab | 待补充 | 无 | 规范图与站点用例 |

## 按钮

结构：容器 + 文字。变体：主 `--primary`、次 `--secondary`。尺寸：只有默认。状态：默认、禁用。

| 部位 | token |
| --- | --- |
| 主按钮底色 / 文字 | `--acme-button-primary-bg` / `--acme-button-primary-text` |
| 次按钮描边 | `--acme-button-secondary-border` |
| 圆角 | `--acme-radius-control` |

Do：一个表单只有一个主按钮。Don't：用主色描边做第三种按钮。

```html
<button class="acme-button acme-button--primary">提交</button>
<button class="acme-button acme-button--secondary">取消</button>
<button class="acme-button acme-button--primary" disabled>禁用</button>
```

## 输入框

结构：单行输入。变体：无。尺寸：只有默认。状态：默认、聚焦、禁用。

| 部位 | token |
| --- | --- |
| 底色 | `--acme-input-bg` |
| 描边 / 聚焦描边 | `--acme-input-border` / `--acme-input-border-focus` |
| 占位文字 | `--acme-text-muted` |

Do：标签写在输入框上方。Don't：只靠占位文字当标签。

```html
<input class="acme-input" placeholder="邮箱">
<input class="acme-input is-focus" value="聚焦">
<input class="acme-input" disabled value="禁用">
```
