---
name: ds-star
label: DS-STAR 数据科学代理框架
description: DS-STAR (Data Science - Structured Thought and Action) 是一个基于 Python 的代理框架，用于自动化数据科学任务。它利用 Google 的 Gemini 模型驱动的多代理系统来分析数据、制定计划、编写和执行代码，并迭代改进解决方案以回答用户的查询。
tags:
  - 数据科学
  - 数据分析
  - 机器学习
  - 自动化
  - Python
---

# DS-STAR Skill

## 技能描述
DS-STAR (Data Science - Structured Thought and Action) 是一个基于 Python 的代理框架，用于自动化数据科学任务。它利用 Google 的 Gemini 模型驱动的多代理系统来分析数据、制定计划、编写和执行代码，并迭代改进解决方案以回答用户的查询。

## 使用场景
- 自动化数据分析任务
- 数据科学项目原型开发
- 机器学习模型开发与评估
- 数据可视化与报告生成
- 数据清洗与预处理自动化

## 触发关键词
- 数据科学分析
- 自动化数据分析
- DS-STAR
- 数据科学代理
- 机器学习自动化
- 数据分析代理

## 安装要求
- Python 3.11+
- 需要配置相应的 API 密钥（如 Google Gemini API）

## 使用方法
1. 将数据文件放入 `data/` 目录
2. 配置 `config.yaml` 文件
3. 运行主脚本：`python dsstar.py --query "您的数据科学问题"`

## 文件说明
- `dsstar.py`: 主脚本，包含代理逻辑和 CLI
- `config.yaml`: 主配置文件
- `prompt.yaml`: 不同 AI 代理的提示词
- `provider.py`: 模型提供者接口
- `pyproject.toml`: 项目元数据和依赖项
- `README.md`: 项目详细文档

## 项目来源
基于 Google Research 论文实现：[DS-STAR: A State-of-the-Art Versatile Data Science Agent](https://research.google/blog/ds-star-a-state-of-the-art-versatile-data-science-agent/)
