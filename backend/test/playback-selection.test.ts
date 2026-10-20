import assert from "node:assert/strict";
import test from "node:test";
import { playbackSelection } from "../../src/features/cameras/playbackSelection.js";
test("authenticated camera-to-NVR mapping overrides incompatible live token namespaces",()=>{
 const record={token:"taoshi:owned:4",source:"taoshi:4"};
 assert.equal(playbackSelection({recordings:[record],protocol:"taoshi-direct",verifiedSelectionToken:record.token},"onvif-source-uuid"),record);
 assert.equal(playbackSelection({recordings:[record],protocol:"taoshi-direct"},"onvif-source-uuid"),undefined);
 assert.equal(playbackSelection({recordings:[record],protocol:"taoshi-direct",verifiedSelectionToken:"foreign"},"onvif-source-uuid"),undefined);
 assert.equal(playbackSelection({recordings:[record,{...record,token:"second"}],protocol:"taoshi-direct",verifiedSelectionToken:record.token},"onvif-source-uuid"),undefined);
 assert.equal(playbackSelection({recordings:[record],protocol:"onvif-profile-g",verifiedSelectionToken:record.token},"onvif-source-uuid"),undefined);
 assert.equal(playbackSelection({recordings:[record]},record.source),record);
});
