import {Button, Canvas} from 'datocms-react-ui';
import type {NewUpload, RenderFieldExtensionCtx} from "datocms-plugin-sdk";
import type {Item, Upload} from '@datocms/cma-client/dist/types/generated/SimpleSchemaTypes'
import {useEffect, useMemo, useState} from "react";
import {buildClient, LogLevel} from '@datocms/cma-client-browser';

// Borrowing a typedef from the plugin SDK. This is what our asset gallery returns in formValues
type AssetGalleryMetadata = NonNullable<NewUpload['default_field_metadata']>[string] & { upload_id: string };
type CollectionRecord = Item & { product_type?: string }
type ImageNeedingUpdate = { id: string, currentBasename: string, slugifiedBasename: string }

const slugifyProductType = (productType: string): string => {

    // TODO replace this with a locale-aware slugify lib, but only if they want localized basenames

    const slugified: string = productType.toLocaleLowerCase("en-US")
        .replace(/\s+/g, '-')

    const pluralized = `${slugified}s`

    return pluralized;
}

const slugifyImageName = ({productType, productHandle, imgMimeType, numberSuffix}: {
    productType: string,
    productHandle: string
    imgMimeType?: string,
    numberSuffix: string | number,
}): string => {
    const mediaType: string = imgMimeType?.startsWith('video') ? 'video' : 'image';
    return `${slugifyProductType(productType)}-${productHandle}-${mediaType}-${numberSuffix}`;
}

export const SEOFriendlyImageNames = ({ctx}: { ctx: RenderFieldExtensionCtx }) => {

    /** Basic setup **/
        // These are provided to us by the plugin SDK. They are passed from main.tsx.
    const {formValues, fieldPath} = ctx;

    // The asset gallery images (or technically, just their metadata)
    const galleryItems = formValues[fieldPath] as AssetGalleryMetadata[]

    // Shopify product handle
    const productHandle = formValues['shopify_product_handle'] as string

    // Shopify collection, which we'll need to look up the product category
    const collectionId = formValues['collection'] as string

    const [images, setImages] = useState<Upload[]>([])
    const [collection, setCollection] = useState<CollectionRecord | null>(null)

    const productType = useMemo(() => {

        if (!collection) return '';

        if (collection['product_type']) {
            return collection['product_type']
        } else {
            console.warn(`Product type not found in collection ${collectionId}`)
            return ''
        }
    }, [collection])

    // Limited-permission API token from https://vrai.admin.datocms.com/environments/datocms-support-plugin-testing/project_settings/access_tokens/321640/edit
    // You could also use ctx.currentUserAccessToken instead, but that has all the permissions of the current editor. This way is safer.
    const accessToken = import.meta.env.VITE_DATOCMS_LIMITED_ACCESS_TOKEN

    // Initialize Dato CMA client
    const client = buildClient({
        apiToken: accessToken,
        environment: 'datocms-support-plugin-testing', // Replace with primary once tested
        logLevel: LogLevel.BASIC, // Or LogLevel.BODY for more debug info
    })

    /** Fetch needed data from the CMA and update our local state **/

    useEffect(() => {
        (async () => {

            console.log('starting fetches')

            try {
                // Get the product type from the collection Id
                const collection = await client.items.find(collectionId)
                if (collection) {
                    setCollection(collection)
                }

                // Get existing image information
                if (galleryItems.length >= 1) {
                    const ids = galleryItems.map(img => img.upload_id)
                    const images = await client.uploads.list({
                        filter: {
                            ids: ids.join()
                        }
                    })

                    // But they come back out-of-order, so we have to manually sort them
                    if (images) {
                        let reorderedImages: Upload[] = []
                        images.forEach(img => {
                            const originalIndex = ids.indexOf(img.id)
                            reorderedImages[originalIndex] = img;
                        })
                        setImages(reorderedImages)
                    }
                }


            } catch (err) {
                console.error(err)
            }

        })()
    }, [collectionId, galleryItems])

    /** Identify images needing a basename update (basename is just the filename without extension, because that's what the CMA wants) **/

    const slugifiedImageNames = useMemo<string[]>(() =>
        images.map(img => slugifyImageName({
            productType,
            productHandle,
            imgMimeType: img.mime_type ?? undefined,
            // numberSuffix: index + 1 // This makes it pretty confusing when they are reordered in the gallery
            numberSuffix: img.md5.slice(0, 5) // We can use a shortened hash instead to better keep track of them
        })), [images])

    const imagesNeedingUpdate = useMemo<ImageNeedingUpdate[]>(() =>
        images.flatMap(((img, index) => {
            if (img.basename !== slugifiedImageNames[index]) {
                return [{
                    id: img.id,
                    currentBasename: img.basename,
                    slugifiedBasename: slugifiedImageNames[index]
                }]
            } else {
                return []
            }
        })), [images, slugifiedImageNames])

    const updateBasename = async ({id, newBasename}: { id: string, newBasename: string }) => {
        try {
            const updatedImage = await client.uploads.update(id, {
                basename: newBasename,
            })

            if (updatedImage.basename === newBasename) {
               setImages(prevImages => prevImages.map(prevImg => prevImg.id === updatedImage.id ? updatedImage : prevImg))
            } else {
                throw new Error(`Image ${id} basename mismatch even after update: ${updatedImage.basename} does not match ${newBasename}`)
            }
        } catch (err) {
            console.error(err)
        }
    }

    return (
        <Canvas ctx={ctx}>
            <Button type="button" buttonSize="xxs">
                Add lorem ipsum
            </Button>

            <h2>Debug:</h2>
            <h3>{imagesNeedingUpdate.length}/{galleryItems.length} images need a basename update:</h3>
            <ul>
                {imagesNeedingUpdate.map(img => <li key={img.id}>(#{img.id}) {img.currentBasename} should
                    be {img.slugifiedBasename}. <a href={"#"} onClick={() => updateBasename({
                        id: img.id,
                        newBasename: img.slugifiedBasename
                    })}>Update?</a></li>)}
            </ul>

            <ul>
                <li>{images.length} images cached (out of {galleryItems.length} in gallery)</li>
                <li>Collection ID: {collectionId}</li>
                <li>Shopify handle: {productHandle}</li>
                <li>Product type: {productType}</li>
            </ul>

            <pre>
                {/*{JSON.stringify(images, null, 2)}*/}
            </pre>

        </Canvas>
    );
};