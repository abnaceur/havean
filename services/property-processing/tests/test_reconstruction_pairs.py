import unittest
import tempfile
from pathlib import Path
from PIL import Image
from property_processing.reconstruction_pairs import camera_groups, matching_pairs, recovery_pairs
class ReconstructionPairs(unittest.TestCase):
    def frames(self,n=40):return [{'name':f'frames/{i:036d}.png','width':640,'height':480,'cameraGroupId':'wide' if i<n//2 else 'tele'} for i in range(n)]
    def test_groups_stay_separate_but_cross_clip_hypotheses_exist(self):
        frames=self.frames();groups=camera_groups(frames)
        self.assertEqual(len(groups),2)
        pairs=matching_pairs(frames)
        self.assertTrue(any(int(a[:-4])<20<=int(b[:-4]) for a,b in pairs))
        self.assertEqual(len(pairs),len(set(pairs)))
        self.assertTrue(set(pairs)<=set(matching_pairs(frames,True)))
    def test_calibration_resolution_and_pair_budgets_are_bounded(self):
        frames=self.frames();frames[0]['width']=320
        with self.assertRaisesRegex(ValueError,'Resolution'):camera_groups(frames)
        frames=self.frames(600)
        self.assertLessEqual(len(matching_pairs(frames,True)),40000)
        frames[0]['cameraGroupId']=None
        with self.assertRaises(ValueError):camera_groups(frames)
    def test_appearance_candidates_connect_non_keyframes_without_replacing_uniform_pairs(self):
        frames=self.frames()
        with tempfile.TemporaryDirectory() as root:
            for i,frame in enumerate(frames):
                colour=(20,180,30) if i in (7,27) else (i*5,20,230-i*3)
                Image.new('RGB',(24,18),colour).save(Path(root)/Path(frame['name']).name)
            baseline=set(matching_pairs(frames))
            actual=set(matching_pairs(frames,image_root=root))
            pair=(Path(frames[7]['name']).name,Path(frames[27]['name']).name)
            self.assertNotIn(pair,baseline)
            self.assertIn(pair,actual)
            self.assertTrue(baseline<=actual)
            self.assertTrue(actual<=set(matching_pairs(frames,True,image_root=root)))
    def test_distinct_supplied_rooms_do_not_match_but_shared_hall_remains_available(self):
        frames=self.frames()
        for i,frame in enumerate(frames):frame['roomId']='Bedroom 1' if i<20 else 'Bedroom 2'
        for broad in (False,True):
            self.assertFalse(any(int(a[:-4])<20<=int(b[:-4]) for a,b in matching_pairs(frames,broad)))
        frames[0]['roomId']=None
        self.assertTrue(any(int(a[:-4])==0 and int(b[:-4])>=20 for a,b in matching_pairs(frames)))

    def test_recovery_targets_missing_views_without_repeating_verified_pairs(self):
        frames=self.frames(80)
        primary=matching_pairs(frames)
        registered={str(i):{'name':Path(frame['name']).name} for i,frame in enumerate(frames[:60])}
        result=recovery_pairs(frames,primary,[{'registeredCameraCount':60,'cameraPoses':registered}])
        self.assertTrue(result)
        self.assertFalse(set(result)&set(primary))
        self.assertTrue(all(int(a[:-4])>=60 or int(b[:-4])>=60 for a,b in result))
        self.assertTrue(set(result)<=set(matching_pairs(frames,True)))
