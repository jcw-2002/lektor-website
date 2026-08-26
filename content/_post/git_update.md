---
title: Git 更新仓库
date: 2025-05-22   
cover: img/article/git_compressed.jpg  
categories:
- 技术分享
tags:
- Git
- update
---


本指南将引导您完成 Git 版本控制中常见的更新和同步操作。

## 检查仓库状态

在进行任何更新之前，最好先了解当前仓库的状态。

```bash
git status
```
此命令会列出所有已修改（modified）、已暂存（staged）、未跟踪（untracked）或已删除（deleted）的文件。通过输出，您可以清楚地知道哪些文件发生了变化。

## 添加更改

根据 `git status` 的输出，您可以选择要包含在下一次提交中的更改。

### 添加所有已修改和已删除的文件

如果您想快速添加所有已跟踪文件中已修改和已删除的更改（不包括未跟踪的新文件），可以使用：

```powershell
git add -u
```
如果您想添加所有更改，包括新文件，可以使用 `git add .` 或 `git add -A`。

## 检查远程仓库配置

在推送代码之前，确保您的本地仓库已正确配置远程仓库地址。

```bash
git remote -v
```
此命令会显示当前配置的远程仓库的名称（通常是 `origin`）及其 URL。您应该能看到 fetch 和 push 的地址。

## 检查和配置 SSH 密钥

使用 SSH 方式与 GitHub 等远程仓库交互更为安全和方便。

### 确认 SSH 密钥是否存在

运行以下命令查看您的 SSH 公钥文件：

```powershell
ls ~/.ssh/id_*.pub
```
如果输出类似 `C:/Users/你的用户名/.ssh/id_ed25519.pub` 或 `/Users/你的用户名/.ssh/id_rsa.pub`，说明密钥已存在。

### 生成新的 SSH 密钥

如果上述命令没有输出，或者您想生成新的密钥，可以使用以下命令（推荐使用 Ed25519 算法）：

```powershell
ssh-keygen -t ed25519 -C "your_email@example.com"
```
按照提示操作，您可以选择密钥的保存位置和设置密码（可选，但建议设置）。

### 将公钥添加到 GitHub

1.  **复制公钥内容**：
    使用以下命令显示并复制您的公钥内容：
    ```powershell
    cat ~/.ssh/id_ed25519.pub
    ```
    如果您的公钥是其他类型（如 `id_rsa.pub`），请相应修改文件名。

2.  **添加到 GitHub**：
    打开 GitHub 网站，进入您的账户设置（Settings），找到 "SSH and GPG keys" 页面。点击 "New SSH key" 或 "Add SSH key"，将复制的公钥内容粘贴到 "Key" 文本框中，给它一个标题（例如 "My Laptop"），然后点击 "Add SSH key"。

## 测试 SSH 连接

添加密钥后，测试一下与 GitHub 的 SSH 连接是否成功：

```powershell
ssh -T git@github.com
```
如果看到类似 "Hi your_username! You've successfully authenticated, but GitHub does not provide shell access." 的消息，说明 SSH 连接配置成功。

### SSH 连接失败的备选方案：使用 HTTPS

如果 SSH 连接遇到问题，或者您暂时不想配置 SSH，可以切换到 HTTPS 方式连接远程仓库：

```bash
git remote set-url origin https://github.com/你的用户名/仓库名.git
```
请将 `你的用户名` 和 `仓库名`替换为您的实际 GitHub 用户名和仓库名称。

## 提交并推送更改

一旦您对更改满意并已正确配置远程仓库，就可以提交并推送它们了。

### 提交更改

```bash
git commit -m "你的更新说明"
```
将 `"你的更新说明"` 替换为对本次提交内容的简明扼要的描述，例如 "修复了用户登录bug" 或 "添加了新的数据验证功能"。

### 推送更改到远程仓库

```bash
git push origin master
```
或者，如果您的主分支名为 `main`（现在新建的仓库默认为 `main`），则使用：
```bash
git push origin main
```
此命令会将您本地的 `master` (或 `main`) 分支的提交推送到名为 `origin` 的远程仓库。

希望这篇指南能帮助您更好地使用 Git 进行代码的版本控制和更新！