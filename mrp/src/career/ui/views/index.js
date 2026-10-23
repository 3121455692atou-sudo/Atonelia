// 事件视图登记表（规格 §1.1）：currentEvent 返回的 view.kind → 怎么演出。P0.3a 一次登记全，各界面包只填自己的文件，不改这里。
// 每个视图模块导出 play(S, view) → Promise<选项 id>；没登记、或者模块还是存根（play 为 null）的种类，用 vn.js 的 playEvent（对话 + 选项）。
// 董事会目标（goal / board）有自己的检查和评测演出，仍在 flow.js 里处理。
import { playEvent } from '../vn.js';
import * as strategy from './strategy.js';

const VIEWS = { strategy };
export const viewFor = kind => VIEWS[kind]?.play || playEvent;
