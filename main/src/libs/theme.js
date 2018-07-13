import {zeroFS, zeroPage} from "../zero";
import Settings from "./settings.js";
import deepcopy from "deepcopy";
import path from "path";
import normalizeComponent from "vue-loader/lib/component-normalizer";
import addStylesClient from "vue-style-loader/lib/addStylesClient";

import Vue from "vue/dist/vue.min.js";


const COMPONENTS = {
	"theme-header": "header.vue",
	"theme-list": "list.vue",
	"theme-post": "post.vue",
	"theme-footer": "footer.vue",
	"named-input": "components/named-input.vue",
	"named-textarea": "components/named-textarea.vue",
	"theme-button": "components/button.vue"
};
const srcContext = require.context("..", true, /\.js$/);



class Theme {
	async getSetting(name) {
		let res = await Settings.get("theme." + name, undefined);
		if(res !== undefined) {
			return res;
		}

		const themeJson = this.getManifest();
		let setting = themeJson.settings.find(setting => setting.name === name);
		return setting.default;
	}

	async getAllSettings() {
		const manifest = deepcopy(this.getManifest().settings);
		const settings = await Settings.getAll();

		for(let setting of manifest) {
			if(!setting.name) {
				continue;
			}

			let value = settings["theme." + setting.name];
			if(value !== undefined) {
				setting.value = value;
			} else {
				setting.value = setting.default;
			}
		}

		return manifest;
	}

	async applySettings(obj) {
		let obj2 = {};
		for(let name of Object.keys(obj)) {
			obj2["theme." + name] = obj[name];
		}

		await Settings.applyPack(obj2);
	}


	getManifest() {
		return require("../theme/theme.json");
	}



	async loadTheme() {
		console.log("Loading theme");

		let files = {};
		for(let name of await zeroFS.readDirectory("theme/__build", true)) {
			files[`./src/theme/${name}`] = await zeroFS.readFile(`theme/__build/${name}`);
		}

		const context = new ThemeContext(files, srcContext);

		for(const name of Object.keys(COMPONENTS)) {
			const compPath = COMPONENTS[name];

			const ex = context.require(`./${compPath}`, "./src/theme").default;

			const injectStyle = () => {
				addStylesClient(ex.options.scopeId, ex.allCss, true, ex.options);
			};
			const Component = normalizeComponent(
				ex.mExports,
				{
					render: ex.render,
					staticRenderFns: ex.staticRenderFns
				},
				false,
				injectStyle,
				ex.options.scopeId,
				null
			);

			Vue.component(name, Component.exports);
		}

		require("../theme/table.sass");
	}
};


class ThemeContext {
	constructor(themeFiles, srcContext) {
		this.themeFiles = themeFiles;
		this.srcContext = srcContext;
		this.srcContextKeys = srcContext.keys();
	}

	require(reqPath, origin) {
		const absPath = "." + path.resolve(origin, reqPath);

		if(absPath.startsWith("./src/theme/")) {
			if(!this.themeFiles.hasOwnProperty(absPath)) {
				throw new TypeError(`require(): ${absPath} cannot be found`);
			}

			const code = this.themeFiles[absPath];
			const func = new Function("require", "module", "exports", code);

			const moduleRequire = reqPath => {
				return this.require(reqPath, path.dirname(absPath));
			};
			const moduleExports = {
				default: {}
			};
			const moduleModule = {
				exports: moduleExports
			};

			func(moduleRequire, moduleModule, moduleExports);
			return moduleModule.exports;
		} else if(absPath.startsWith("./src/")) {
			const srcPath = absPath.replace("./src/", "./");
			if(this.srcContextKeys.indexOf(srcPath) > -1) {
				return this.srcContext(srcPath);
			} else if(this.srcContextKeys.indexOf(`${srcPath}.js`) > -1) {
				return this.srcContext(`${srcPath}.js`);
			} else {
				throw new TypeError(`require(): ${absPath} cannot be found`);
			}
		} else {
			throw new TypeError(`require(): ${absPath} is not a valid path`);
		}
	}
};

export default new Theme();