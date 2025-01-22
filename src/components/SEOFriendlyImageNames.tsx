import {Button, Canvas} from 'datocms-react-ui';
import type {NewUpload, RenderFieldExtensionCtx} from "datocms-plugin-sdk";
import {useEffect, useState} from "react";

// Borrowing a typedef from the plugin SDK. This is what our asset gallery returns in formValues
type AssetGalleryMetadata = NonNullable<NewUpload['default_field_metadata']>[string];
type ImageInfo = {
    upload_id: string,
    filename: string,
}

export const SEOFriendlyImageNames = ({ctx}: { ctx: RenderFieldExtensionCtx }) => {

    /** Basic setup **/

        // These are provided to us by the plugin SDK. They are passed from main.tsx.
    const {formValues, fieldPath} = ctx;

    // The asset gallery images (or technically, just their metadata)
    const assetGalleryValues = formValues[fieldPath] as AssetGalleryMetadata[]

    // Shopify product handle
    const productHandle = formValues['shopify_product_handle'] as string

    // Shopify collection, which we'll need to look up the product category
    const collectionId = formValues['collection'] as string

    const [images, setImages] = useState<ImageInfo[]>([])

    /** Fetch needed data from the CMA and update our local state **/

    useEffect(() => {

    }, [collectionId, images])


    return (
        <Canvas ctx={ctx}>
            <Button type="button" buttonSize="xxs">
                Add lorem ipsum
            </Button>
            <h3>Debug:</h3>
            <ul>
                <li>{images.length} images detected</li>
            </ul>
            <h4>formValues</h4>
            <pre>
                {JSON.stringify(formValues, null, 2)}
            </pre>
        </Canvas>
    );
};