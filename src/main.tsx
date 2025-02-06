import {connect} from "datocms-plugin-sdk";
import "datocms-react-ui/styles.css";
import {render} from "./utils/render";
import {SEOFriendlyImageNames} from "./components/SEOFriendlyImageNames.tsx";
import {GlobalConfigScreen} from "./components/GlobalConfigScreen.tsx";
import {ManualFieldConfigScreen} from "./components/ManualFieldConfigScreen.tsx";

connect({
    manualFieldExtensions() {
        return [
            {
                id: 'seoFriendlyImageNames',
                name: 'SEO-Friendly Image Names',
                type: 'addon',
                fieldTypes: ['gallery'],
                configurable: true
            },
        ];
    },
    renderFieldExtension(_, ctx) {
            render(<SEOFriendlyImageNames ctx={ctx}/>)
    },
    renderConfigScreen(ctx) {
            render(<GlobalConfigScreen ctx={ctx}/>)
    },
    renderManualFieldExtensionConfigScreen(_, ctx) {
        render(<ManualFieldConfigScreen ctx={ctx}/>)
    }
});
