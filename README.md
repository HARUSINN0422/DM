# DM

ブラウザで遊ぶDM風オンラインカードバトルです。

## 現在の構成

- Node.js + Express
- Socket.IOによるオンライン対戦
- クイックマッチ
- 40枚デッキ
- 同名カード4枚まで
- 5枚のシールド
- 初期手札5枚
- ターン交代
- ドロー
- Raspberry Pi上のカード画像を直接配信
- GitHub更新を1分ごとに確認して自動更新・再起動
- カード画像はGitHubへ保存しない

## カード画像

このプロジェクトはカード画像をGitHubに保存しません。

デフォルトでは次のディレクトリをカード画像として使用します。

    /home/harusinn/dm_card_images

ユーザーが提示したダウンロードスクリプトで保存した画像を、そのディレクトリに置いてください。

別の場所にある場合は:

    export CARD_IMAGE_DIR="/カード画像のディレクトリ"

例えば既存フォルダが /home/harusinn/Desktop/dm_card_images なら:

    export CARD_IMAGE_DIR="/home/harusinn/Desktop/dm_card_images"

## Raspberry Piへの初回セットアップ

    cd /home/harusinn/Desktop
    git clone https://github.com/HARUSINN0422/DM.git
    cd DM
    npm install

起動:

    npm start

デフォルトポート:

    3008

ブラウザ:

    http://ラズパイのIP:3008/

カード確認:

    http://ラズパイのIP:3008/api/cards

## GitHub自動更新

server.jsが60秒ごとにGitHubのmainを確認します。

変更があれば:

1. git fetch
2. git pull --ff-only
3. npm install --omit=dev
4. Node.jsを再起動

カード画像はGit管理対象外なので、GitHub更新で削除されません。

## カード情報

現在、手元にあるのがカード画像だけなので、画像からカードのコスト・文明・パワー・効果を自動判定することはしていません。

カード情報の定義は:

    data/cards.json

です。

今後ここにカードID、名前、文明、コスト、種族、パワー、効果などを追加して、実際のカード処理へ接続できます。

## 次の実装候補

- マナチャージ
- 召喚
- 攻撃
- ブロック
- シールドブレイク
- シールド・トリガー
- クリーチャーのパワー計算
- 呪文
- カード能力
- デッキ保存
- 対戦履歴
- 観戦
- CPU対戦
- ランクマッチ

## 権利について

カード画像・カード名・カードテキスト等を公開・利用する場合は、権利関係を確認してください。
