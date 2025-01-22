import {connect} from "datocms-plugin-sdk";
import "datocms-react-ui/styles.css";
import ConfigScreen from "./entrypoints/ConfigScreen";
import {render} from "./utils/render";
import {SEOFriendlyImageNames} from "./components/SEOFriendlyImageNames.tsx";

connect({
    renderConfigScreen(ctx) {
        return render(<ConfigScreen ctx={ctx}/>);
    },
    manualFieldExtensions() {
        return [
            {
                id: 'seoFriendlyImageNames',
                name: 'SEO-Friendly Image Names',
                type: 'addon',
                fieldTypes: ['gallery'],
            },
        ];
    },
    renderFieldExtension(id, ctx) {
        if (id === 'seoFriendlyImageNames') {
            render(<SEOFriendlyImageNames ctx={ctx}/>)
        }
    }
});
